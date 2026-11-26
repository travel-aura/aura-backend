// Re-detects city and country for every existing post, so profile city counts
// show real cities ("Rome") instead of neighbourhoods ("Monti", "Trastevere").
//
//   node scripts/backfill-cities.mjs            preview only, changes nothing
//   node scripts/backfill-cities.mjs --apply    writes the new city and country
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MAPBOX_ACCESS_TOKEN in .env,
// and the 2026-11-25 migration already run.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPBOX_ACCESS_TOKEN } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MAPBOX_ACCESS_TOKEN) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or MAPBOX_ACCESS_TOKEN in .env')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function fetchAll(build) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

// Same rule as the backend upload: city ("place") first, then locality, then district.
const cache = new Map()
async function detect(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (cache.has(key)) return cache.get(key)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Mapbox ${res.status} for ${key}`)
  const feature = (await res.json()).features?.[0]
  const areas = [feature, ...(feature?.context ?? [])].filter(Boolean)
  const byType = (t) => areas.find((c) => c.id?.startsWith(`${t}.`))
  const city = (byType('place') ?? byType('locality') ?? byType('district'))?.text ?? null
  const cc = byType('country')?.short_code
  const result = { city, country_code: typeof cc === 'string' ? cc.slice(0, 2).toLowerCase() : null }
  cache.set(key, result)
  return result
}

async function pool(items, size, fn) {
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item) }
  }))
}

const posts = await fetchAll(() => db.rpc('get_auras_for_city_backfill'))
const oldCityRows = await fetchAll(() => db.from('user_cities').select('user_id, city_name'))
console.log(`Checking ${posts.length} posts with a location…`)

let done = 0
await pool(posts, 5, async (p) => {
  try { p.next = await detect(p.lat, p.lng) } catch (e) { p.next = null; console.warn(String(e.message)) }
  if (++done % 50 === 0) console.log(`  ${done}/${posts.length}`)
})

// Per-user city counts: what the profile shows today vs after this script.
const before = new Map(), after = new Map()
for (const r of oldCityRows) before.set(r.user_id, (before.get(r.user_id) ?? 0) + 1)
const afterSets = new Map()
for (const p of posts) {
  const n = p.next ?? { city: p.city_name, country_code: p.country_code }
  if (!n.city) continue
  if (!afterSets.has(p.user_id)) afterSets.set(p.user_id, new Map())
  afterSets.get(p.user_id).set(`${n.city}|${n.country_code ?? ''}`, n)
}
for (const [u, set] of afterSets) after.set(u, set.size)

console.log('\nCity count per user (today → after):')
const users = [...new Set([...before.keys(), ...after.keys()])]
  .sort((a, b) => (before.get(b) ?? 0) - (before.get(a) ?? 0))
for (const u of users) {
  const cities = [...(afterSets.get(u)?.values() ?? [])]
    .map((c) => `${c.city}${c.country_code ? ` (${c.country_code.toUpperCase()})` : ''}`).sort()
  console.log(`  ${u.slice(0, 8)}  ${String(before.get(u) ?? 0).padStart(3)} → ${String(after.get(u) ?? 0).padEnd(3)}  ${cities.slice(0, 12).join(', ')}${cities.length > 12 ? ', …' : ''}`)
}

const changes = posts.filter((p) => p.next && (p.next.city !== p.city_name || p.next.country_code !== p.country_code))
console.log(`\n${changes.length} of ${posts.length} posts would get a new city or country.`)
const failed = posts.filter((p) => !p.next).length
if (failed) console.log(`${failed} posts could not be looked up and will be left as they are.`)

if (!APPLY) {
  console.log('\nPreview only. Nothing was changed. Run again with --apply to save.')
  process.exit(0)
}

let saved = 0
await pool(changes, 5, async (p) => {
  const { error } = await db.from('auras').update({ city_name: p.next.city, country_code: p.next.country_code }).eq('id', p.id)
  if (error) console.error(`Post ${p.id}: ${error.message}`); else saved++
})
console.log(`\nSaved ${saved} of ${changes.length} posts.`)
