import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { supabase, createAuthClient } from './lib/supabase'
import { authenticateSupabase } from './middleware/auth'
import { decideVerified, roundToArea } from './lib/verification'
import { upload, detectImageType, uploadErrorHandler, validatePostText, MAX_POST_IMAGES, authLimiter, uploadLimiter, apiLimiter } from './lib/limits'

dotenv.config()

const app = express()

// Logs the real error for us and sends the user a generic message, so database
// and internal details never reach the browser.
function serverError(res: express.Response, err: unknown) {
  console.error(err)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
// Cloud Run sits behind one Google proxy; this makes req.ip the real client IP for rate limiting.
app.set('trust proxy', 1)
const PORT = parseInt(process.env.PORT || '8080', 10)

// CORS: which websites may call this API.
// Cloud Run sets K_SERVICE, so local and LAN addresses are only allowed when running on your own machine.
const productionOrigins = [
  'https://aura-frontend-255644230597.us-central1.run.app',
  process.env.CORS_ORIGIN,
]
const devOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3006',
  // Phone testing on your local network
  'http://10.126.30.88:3000',
  'http://10.126.30.88:3001',
  'http://10.126.30.88:3002',
  'http://10.126.30.88:3003',
  'http://10.126.30.88:3006',
]
const allowedOrigins = [
  ...productionOrigins,
  ...(process.env.K_SERVICE ? [] : devOrigins),
].filter((origin): origin is string => Boolean(origin))

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
)
app.use(express.json({ limit: '100kb' }))
app.use('/auth', authLimiter)
app.use('/api', apiLimiter)


app.get('/', (_req, res) => {
  res.json({ message: 'Aura Backend Running' })
})

// ========== AUTH ROUTES ==========

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const { data, error } = await createAuthClient().auth.signUp({
      email,
      password,
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({
      ok: true,
      user: data.user,
      session: data.session,
    })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return res.status(401).json({ error: error.message })
    }

    return res.json({
      ok: true,
      user: data.user,
      session: data.session,
    })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// Swap a refresh token for a new session, so users stay logged in after the
// short-lived access token expires (about an hour).
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body || {}
    if (!refresh_token || typeof refresh_token !== 'string') {
      return res.status(400).json({ error: 'refresh_token required' })
    }

    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token })

    if (error || !data.session) {
      return res.status(401).json({ error: 'Session expired, please log in again' })
    }

    return res.json({
      ok: true,
      user: data.user,
      session: data.session,
    })
  } catch (err: any) {
    console.error('Refresh error:', err)
    return res.status(500).json({ error: 'Could not refresh session' })
  }
})

app.post('/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]

    const { error } = await supabase.auth.admin.signOut(token)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.post('/auth/google', async (req, res) => {
  try {
    const { id_token } = req.body

    if (!id_token) {
      return res.status(400).json({ error: 'id_token required' })
    }

    const { data, error } = await createAuthClient().auth.signInWithIdToken({
      provider: 'google',
      token: id_token,
    })

    if (error) {
      return res.status(401).json({ error: error.message })
    }

    return res.json({
      ok: true,
      user: data.user,
      session: data.session,
    })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.get('/me', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase.rpc('get_user_profile', {
      p_user_id: userId
    })

    if (error) {
      console.error('Profile fetch error:', error)
      return serverError(res, error)
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    return res.json({ ok: true, user: data[0] })
  } catch (err: any) {
    console.error('/me error:', err)
    return serverError(res, err)
  }
})

// ========== AURA UPLOAD ROUTE ==========
app.post('/api/auras/upload', uploadLimiter, authenticateSupabase, upload.array('images', MAX_POST_IMAGES), async (req: any, res) => {
  try {
    const files = req.files as Express.Multer.File[]

    // Safety check: ensure metadata exists
    if (!req.body.metadata) return res.status(400).json({ error: 'Metadata is missing' });
    const metadata = JSON.parse(req.body.metadata)

    const userId = req.user.id

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images provided' })
    }
    if (files.some((f) => !detectImageType(f.buffer))) {
      return res.status(400).json({ error: 'Only JPEG, PNG or WebP images can be uploaded' })
    }
    const textError = validatePostText({ title: metadata.title, description: metadata.description, tags: metadata.tags })
    if (textError) return res.status(400).json({ error: textError })

    // 0. Decide the verified badge on the server, not from the client's flag
    const photoLat = Number.isFinite(Number(metadata.lat)) && metadata.lat !== null && metadata.lat !== undefined ? Number(metadata.lat) : null
    const photoLng = Number.isFinite(Number(metadata.lng)) && metadata.lng !== null && metadata.lng !== undefined ? Number(metadata.lng) : null
    let existingSpot: { latitude: number; longitude: number } | null = null
    if (metadata.place_id) {
      const { data: spotRows } = await supabase.rpc('get_place_by_id', { p_place_id: metadata.place_id })
      if (!spotRows || spotRows.length === 0) {
        return res.status(400).json({ error: 'Spot not found' })
      }
      existingSpot = { latitude: spotRows[0].latitude, longitude: spotRows[0].longitude }
    }
    const verification = decideVerified({
      claimedVerified: !!metadata.is_verified,
      lat: photoLat,
      lng: photoLng,
      takenAt: metadata.taken_at || null,
      spot: existingSpot,
    })
    if (metadata.is_verified && !verification.verified) {
      console.warn(`Upload by ${userId} not verified: ${verification.reason}`)
    }

    // "Hide exact location": verification above used the exact GPS; from here on
    // only a rounded position (~1 km) is used and stored. Not available when
    // adding a shot to an existing spot, which is public by definition.
    const hideExactLocation = metadata.hide_exact_location === true && !metadata.place_id
    const hasCoords = photoLat !== null && photoLng !== null && !(photoLat === 0 && photoLng === 0)
    const publicLat = hasCoords ? (hideExactLocation ? roundToArea(photoLat as number) : photoLat) : null
    const publicLng = hasCoords ? (hideExactLocation ? roundToArea(photoLng as number) : photoLng) : null

    // 1. Upload ALL files
    const uploadPromises = files.map(async (file) => {
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.webp`

      const { error: uploadError } = await supabase.storage
        .from('aura-images')
        .upload(fileName, file.buffer, { contentType: 'image/webp' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('aura-images')
        .getPublicUrl(fileName)

      return publicUrl
    })

    const publicUrls = await Promise.all(uploadPromises)

    // 2. Reverse geocode city and country from lat/lng
    let cityName: string | null = null
    let countryCode: string | null = null
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN
    if (metadata.lat && metadata.lng && mapboxToken) {
      try {
        const geocodeRes = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${metadata.lng},${metadata.lat}.json?access_token=${mapboxToken}`
        )
        const geocodeData = await geocodeRes.json() as any
        const feature = geocodeData.features?.[0]
        // Mapbox lists areas from smallest to largest (neighbourhood, locality, place...).
        // Take the city ("place") first; fall back to locality or district only if there is none.
        // Picking the first match returned neighbourhoods like "Monti" instead of "Rome".
        const areas: any[] = [feature, ...(feature?.context ?? [])].filter(Boolean)
        const byType = (type: string) => areas.find((c: any) => c.id?.startsWith(`${type}.`))
        cityName = (byType('place') ?? byType('locality') ?? byType('district'))?.text ?? null
        const country = byType('country')
        countryCode = typeof country?.short_code === 'string' ? country.short_code.slice(0, 2).toLowerCase() : null
      } catch (e) {
        console.error('Mapbox geocoding failed:', e)
      }
    }


    // 3. Find or create Place
    // New spots are named after the venue, or else the post's title (never "Unnamed Spot").
    const spotName =
      (typeof metadata.place_name === 'string' && metadata.place_name.trim()) ||
      (typeof metadata.title === 'string' && metadata.title.trim()) ||
      null
    let placeId: string | null = metadata.place_id || null
    let isNewPlace = false

    if (!placeId) {
      if (hideExactLocation && hasCoords) {
        // Hidden location: its own approximate spot, never shared or matched.
        const { data: newId } = await supabase.rpc('create_place', {
          p_name: typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title.trim() : null,
          p_lat: publicLat,
          p_lng: publicLng,
          p_venue_id: null,
          p_is_approximate: true
        })
        placeId = newId
        isNewPlace = true
      } else if (metadata.venue_id) {
        // Named venue: match by venue_id or create
        const { data: existingId } = await supabase.rpc('find_place_by_venue_id', {
          p_venue_id: metadata.venue_id
        })

        if (existingId) {
          placeId = existingId
        } else {
          const { data: newId } = await supabase.rpc('create_place', {
            p_name: spotName,
            p_lat: photoLat ?? 0,
            p_lng: photoLng ?? 0,
            p_venue_id: metadata.venue_id
          })
          placeId = newId
          isNewPlace = true
        }
      } else if (hasCoords) {
        // GPS spot: check proximity
        const { data: nearby } = await supabase.rpc('check_nearby_place', {
          p_lat: photoLat,
          p_lng: photoLng,
          p_radius_meters: 20
        })

        if (nearby && nearby.length > 0) {
          placeId = nearby[0].id
        } else {
          const { data: newId } = await supabase.rpc('create_place', {
            p_name: spotName,
            p_lat: photoLat,
            p_lng: photoLng,
            p_venue_id: null
          })
          placeId = newId
          isNewPlace = true
        }
      }
    }

    // 4. Insert post
    const payload = {
      p_user_id:       userId,
      p_title:         String(metadata.title || 'Untitled'),
      p_image_urls:    publicUrls,
      // Hidden posts store only the rounded position, and no direction or altitude.
      p_heading:       hideExactLocation ? 0 : Number(metadata.heading) || 0,
      p_altitude:      hideExactLocation ? 0 : Number(metadata.altitude) || 0,
      p_lng:           publicLng ?? 0,
      p_lat:           publicLat ?? 0,
      p_is_verified:   verification.verified,
      p_description:   String(metadata.description || ''),
      p_parent_id:     metadata.parent_id || null,
      p_tags:          Array.isArray(metadata.tags) ? metadata.tags : null,
      p_city_name:     cityName,
      p_archetype_tag: metadata.archetype_tag || null,
      p_taken_at:      metadata.taken_at || null,
      p_tz_offset:     metadata.tz_offset || null,
      p_gps_accuracy:  metadata.gps_accuracy || null,
      p_gps_timestamp: metadata.gps_timestamp || null,
      p_place_name:    hideExactLocation ? null : metadata.place_name || null,
      p_place_id:      placeId,
    };

    const { data: newPostId, error: dbError } = await supabase.rpc('insert_aura', payload);

    if (dbError) {
      return serverError(res, dbError)
    }

    // 5. Country, for the Cities page (separate update so insert_aura keeps its signature)
    if (countryCode && newPostId) {
      const { error: countryError } = await supabase.from('auras').update({ country_code: countryCode }).eq('id', newPostId)
      if (countryError) console.error('Saving country failed:', countryError)
    }

    // 6. If this is a perspective, notify the parent post owner
    if (metadata.parent_id) {
      const { data: parentAura } = await supabase
        .from('auras')
        .select('user_id')
        .eq('id', metadata.parent_id)
        .single()
      if (parentAura && parentAura.user_id !== userId) {
        await supabase.rpc('create_notification', {
          p_recipient_id: parentAura.user_id,
          p_actor_id: userId,
          p_type: 'perspective',
          p_aura_id: metadata.parent_id
        })
      }
    }

    return res.status(200).json({ success: true, urls: publicUrls })
  } catch (err: any) {
    console.error('Upload Error Details:', err)
    return serverError(res, err)
  }
})

// ========== PLACES ==========
app.get('/api/places/feed', async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10
    const offset = parseInt(req.query.offset as string) || 0
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : null
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : null
    // Optional search radius in metres, clamped to 100 m - 100 km. Without it, results are only sorted by distance.
    const rawRadius = req.query.radius ? parseFloat(req.query.radius as string) : NaN
    const radius = Number.isFinite(rawRadius) ? Math.min(Math.max(rawRadius, 100), 100000) : null
    const following = req.query.following === 'true'
    const tag = (req.query.tag as string) || null
    const query = (req.query.q as string) || null

    let followerId = null
    if (following) {
      const authHeader = req.headers.authorization
      if (authHeader) {
        const token = authHeader.split(' ')[1]
        const { data: { user } } = await supabase.auth.getUser(token)
        if (user) followerId = user.id
      }
    }

    const { data, error } = await supabase.rpc('get_places_feed', {
      p_limit: limit,
      p_offset: offset,
      p_lat: lat,
      p_lng: lng,
      p_follower_id: followerId,
      p_tag: tag,
      p_query: query,
      p_radius_meters: radius
    })

    if (error) {
      console.error('Places feed error:', error)
      return serverError(res, error)
    }

    return res.json({
      ok: true,
      places: data || [],
      pagination: { limit, offset, count: data?.length || 0 }
    })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.get('/api/places/nearby', async (req: any, res) => {
  try {
    const lat = parseFloat(req.query.lat as string)
    const lng = parseFloat(req.query.lng as string)
    const radius = parseFloat(req.query.radius as string) || 50

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng are required' })
    }

    const { data, error } = await supabase.rpc('check_nearby_place', {
      p_lat: lat,
      p_lng: lng,
      p_radius_meters: radius
    })

    if (error) return serverError(res, error)
    return res.json({ ok: true, places: data || [] })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.get('/api/places/:id', async (req: any, res) => {
  try {
    let viewerId = null
    const authHeader = req.headers.authorization
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) viewerId = user.id
    }

    const [placeResult, postsResult] = await Promise.all([
      supabase.rpc('get_place_by_id', { p_place_id: req.params.id }),
      supabase.rpc('get_place_posts', { p_place_id: req.params.id, p_viewer_id: viewerId })
    ])

    if (placeResult.error) {
      console.error('Place fetch error:', placeResult.error)
      return serverError(res, placeResult.error)
    }
    if (!placeResult.data || placeResult.data.length === 0) {
      return res.status(404).json({ error: 'Place not found' })
    }

    return res.json({
      ok: true,
      place: placeResult.data[0],
      posts: postsResult.data || []
    })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== GET USER'S AURAS ==========
app.get('/api/auras/me', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id

    // Use RPC to properly extract lat/lng from PostGIS geography
    const { data, error } = await supabase.rpc('get_user_auras', {
      p_user_id: userId
    })

    if (error) {
      console.error('Database error:', error)
      return serverError(res, error)
    }

    return res.json({ ok: true, auras: data || [] })
  } catch (err: any) {
    console.error('Fetch auras error:', err)
    return serverError(res, err)
  }
})

// ========== GET USER'S ARCHETYPE STATS ==========
app.get('/api/auras/me/stats', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase.rpc('get_user_stats', { p_user_id: userId })

    if (error) {
      console.error('Stats database error:', error)
      return serverError(res, error)
    }

    const row = data?.[0]
    const stats = {
      city_count:     Number(row?.city_count     ?? 0),
      verified_count: Number(row?.verified_count ?? 0),
      follower_count: Number(row?.follower_count ?? 0),
      friend_count:   Number(row?.friend_count   ?? 0),
      top_tags:       (row?.top_tags ?? []) as string[],
      cities:         (row?.cities   ?? []) as string[],
      city_list:      (row?.city_list ?? []) as { city: string; country_code: string | null; post_count: number }[],
    }

    return res.json({ ok: true, stats })
  } catch (err: any) {
    console.error('Fetch stats error:', err)
    return serverError(res, err)
  }
})

// ========== CHECK NEARBY AURAS (SPATIAL SNAPPING) ==========
app.get('/api/auras/check-nearby', async (req: any, res) => {
  try {
    const lat = parseFloat(req.query.lat as string)
    const lng = parseFloat(req.query.lng as string)
    const radius = parseFloat(req.query.radius as string) || 5

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng are required' })
    }

    const { data, error } = await supabase.rpc('check_nearby_auras', {
      p_lat: lat,
      p_lng: lng,
      p_radius_meters: radius
    })

    if (error) {
      console.error('Nearby check error:', error)
      return serverError(res, error)
    }

    return res.json({ ok: true, nearby: data || [] })
  } catch (err: any) {
    console.error('Nearby check error:', err)
    return serverError(res, err)
  }
})

// ========== GET FEED (ALL AURAS WITH PAGINATION + SPATIAL + TAG FILTER) ==========
app.get('/api/auras/feed', async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10
    const offset = parseInt(req.query.offset as string) || 0
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : null
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : null
    const radius = parseFloat(req.query.radius as string) || 5000
    const following = req.query.following === 'true'
    const tag = (req.query.tag as string) || null
    const query = (req.query.q as string) || null

    // Resolve current user for following filter and is_liked
    let viewerId = null
    const authHeader = req.headers.authorization
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) viewerId = user.id
    }
    const followerId = following ? viewerId : null

    const { data, error } = await supabase.rpc('search_auras', {
      p_limit: limit,
      p_offset: offset,
      p_lat: lat,
      p_lng: lng,
      p_radius_meters: radius,
      p_follower_id: followerId,
      p_viewer_id: viewerId,
      p_tag: tag,
      p_query: query
    })

    if (error) {
      console.error('Feed database error:', error)
      return serverError(res, error)
    }

    return res.json({
      ok: true,
      auras: data || [],
      pagination: { limit, offset, count: data?.length || 0 }
    })
  } catch (err: any) {
    console.error('Fetch feed error:', err)
    return serverError(res, err)
  }
})

// ========== FOLLOWS ==========
app.get('/api/follows/followers', authenticateSupabase, async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_followers', {
      p_user_id: req.user.id,
      p_current_user_id: req.user.id
    })
    if (error) return serverError(res, error)
    return res.json({ users: data || [] })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.get('/api/follows/following', authenticateSupabase, async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_following', {
      p_user_id: req.user.id
    })
    if (error) return serverError(res, error)
    return res.json({ users: data || [] })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.delete('/api/followers/:user_id', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('unfollow_user', {
      p_follower_id: req.params.user_id,
      p_following_id: req.user.id
    })
    if (error) return serverError(res, error)
    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.get('/api/users/search', authenticateSupabase, async (req: any, res) => {
  try {
    const q = req.query.q as string
    if (!q || q.trim().length === 0) return res.status(400).json({ error: 'q is required' })
    const { data, error } = await supabase.rpc('search_users', {
      p_query: q.trim(),
      p_current_user_id: req.user.id
    })
    if (error) return serverError(res, error)
    return res.json({ users: data || [] })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.post('/api/follows', authenticateSupabase, async (req: any, res) => {
  try {
    const { user_id } = req.body
    if (!user_id) return res.status(400).json({ error: 'user_id required' })
    const { error } = await supabase.rpc('follow_user', {
      p_follower_id: req.user.id,
      p_following_id: user_id
    })
    if (error) return serverError(res, error)
    // Create follow notification for the person being followed
    await supabase.rpc('create_notification', {
      p_recipient_id: user_id,
      p_actor_id: req.user.id,
      p_type: 'follow'
    })
    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.delete('/api/follows/:user_id', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('unfollow_user', {
      p_follower_id: req.user.id,
      p_following_id: req.params.user_id
    })
    if (error) return serverError(res, error)
    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', authenticateSupabase, async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_notifications', {
      p_user_id: req.user.id
    })
    if (error) return serverError(res, error)
    return res.json({ ok: true, notifications: data || [] })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.patch('/api/notifications/read', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('mark_notifications_read', {
      p_user_id: req.user.id
    })
    if (error) return serverError(res, error)
    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== PUBLIC USER PROFILE ==========
app.get('/api/users/:id', authenticateSupabase, async (req: any, res) => {
  try {
    const profileUserId = req.params.id
    const viewerId = req.user.id

    const [profileResult, postsResult, statsResult] = await Promise.all([
      supabase.rpc('get_user_public_profile', {
        p_profile_user_id: profileUserId,
        p_viewer_id: viewerId
      }),
      supabase.rpc('get_user_public_posts', { p_user_id: profileUserId, p_viewer_id: viewerId }),
      supabase.rpc('get_user_stats', { p_user_id: profileUserId })
    ])

    if (profileResult.error) return serverError(res, profileResult.error)
    if (!profileResult.data || profileResult.data.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (postsResult.error) return serverError(res, postsResult.error)
    if (statsResult.error) return serverError(res, statsResult.error)

    const statsRow = statsResult.data?.[0]
    const stats = {
      city_count:     Number(statsRow?.city_count     ?? 0),
      verified_count: Number(statsRow?.verified_count ?? 0),
      follower_count: Number(statsRow?.follower_count ?? 0),
      friend_count:   Number(statsRow?.friend_count   ?? 0),
      top_tags:       (statsRow?.top_tags ?? []) as string[],
      cities:         (statsRow?.cities   ?? []) as string[],
      city_list:      (statsRow?.city_list ?? []) as { city: string; country_code: string | null; post_count: number }[],
    }

    const userPosts = postsResult.data || []
    return res.json({
      ok: true,
      profile: profileResult.data[0],
      posts: userPosts,
      auras: userPosts,
      stats
    })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== SAVES (frontend URL pattern: /api/saves) ==========
app.get('/api/saves', authenticateSupabase, async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_saved_auras', { p_user_id: req.user.id })
    if (error) return serverError(res, error)
    return res.json({ ok: true, auras: data || [] })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.get('/api/saves/check', authenticateSupabase, async (req: any, res) => {
  try {
    const auraId = req.query.aura_id as string
    if (!auraId) return res.status(400).json({ error: 'aura_id required' })
    const { data, error } = await supabase
      .from('saves')
      .select('aura_id')
      .eq('user_id', req.user.id)
      .eq('aura_id', auraId)
      .maybeSingle()
    if (error) return serverError(res, error)
    return res.json({ saved: !!data })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.post('/api/saves', authenticateSupabase, async (req: any, res) => {
  try {
    const { aura_id } = req.body
    if (!aura_id) return res.status(400).json({ error: 'aura_id required' })
    const { error } = await supabase.rpc('save_aura', { p_user_id: req.user.id, p_aura_id: aura_id })
    if (error) return serverError(res, error)
    // Notify post owner
    const { data: aura } = await supabase.from('auras').select('user_id').eq('id', aura_id).single()
    if (aura && aura.user_id !== req.user.id) {
      await supabase.rpc('create_notification', {
        p_recipient_id: aura.user_id,
        p_actor_id: req.user.id,
        p_type: 'save',
        p_aura_id: aura_id
      })
    }
    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// Save several posts at once (a whole city guide). One notification per owner, not per post.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BULK_SAVES = 50
app.post('/api/saves/bulk', authenticateSupabase, async (req: any, res) => {
  try {
    const raw = req.body?.aura_ids
    if (!Array.isArray(raw) || raw.length === 0) return res.status(400).json({ error: 'aura_ids required' })
    const ids = [...new Set(raw.filter((id: unknown) => typeof id === 'string' && UUID_RE.test(id)))] as string[]
    if (ids.length === 0) return res.status(400).json({ error: 'aura_ids required' })
    if (ids.length > MAX_BULK_SAVES) return res.status(400).json({ error: `At most ${MAX_BULK_SAVES} posts at once` })

    // Only posts that exist
    const { data: auras, error: findError } = await supabase.from('auras').select('id, user_id').in('id', ids)
    if (findError) return serverError(res, findError)
    const found = auras || []

    const results = await Promise.all(
      found.map((a: any) => supabase.rpc('save_aura', { p_user_id: req.user.id, p_aura_id: a.id }))
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) return serverError(res, failed.error)

    const owners = new Map<string, string>()
    for (const a of found as any[]) {
      if (a.user_id !== req.user.id && !owners.has(a.user_id)) owners.set(a.user_id, a.id)
    }
    for (const [ownerId, auraId] of owners) {
      await supabase.rpc('create_notification', {
        p_recipient_id: ownerId,
        p_actor_id: req.user.id,
        p_type: 'save',
        p_aura_id: auraId
      })
    }
    return res.json({ ok: true, saved: found.length })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.delete('/api/saves/:aura_id', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('unsave_aura', {
      p_user_id: req.user.id,
      p_aura_id: req.params.aura_id
    })
    if (error) return serverError(res, error)
    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== LIKES ==========
app.post('/api/likes', authenticateSupabase, async (req: any, res) => {
  try {
    const { aura_id } = req.body
    if (!aura_id) return res.status(400).json({ error: 'aura_id required' })

    const { error } = await supabase.rpc('like_aura', { p_user_id: req.user.id, p_aura_id: aura_id })
    if (error) return serverError(res, error)

    // Send notification to post owner (skip if liking own post)
    const { data: aura } = await supabase
      .from('auras')
      .select('user_id')
      .eq('id', aura_id)
      .single()

    if (aura && aura.user_id !== req.user.id) {
      await supabase.rpc('create_notification', {
        p_recipient_id: aura.user_id,
        p_actor_id: req.user.id,
        p_type: 'like'
      })
    }

    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.delete('/api/likes/:aura_id', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('unlike_aura', {
      p_user_id: req.user.id,
      p_aura_id: req.params.aura_id
    })
    if (error) return serverError(res, error)
    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== PERSPECTIVES ==========
app.get('/api/auras/:id/perspectives', async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_aura_perspectives', {
      p_parent_id: req.params.id
    })
    if (error) return serverError(res, error)
    return res.json({ ok: true, perspectives: data || [] })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== GET SINGLE AURA BY ID ==========
app.get('/api/auras/:id', async (req: any, res) => {
  try {
    const auraId = req.params.id

    if (!auraId || auraId === 'null' || auraId === 'undefined') {
      return res.status(400).json({ error: 'Invalid aura id' })
    }

    // Optionally resolve viewer for is_saved field
    let viewerId = null
    const authHeader = req.headers.authorization
    if (authHeader) {
      const token = authHeader.split(' ')[1]
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) viewerId = user.id
    }

    const { data, error } = await supabase.rpc('get_aura_by_id', {
      p_aura_id: auraId,
      p_viewer_id: viewerId
    })

    if (error) {
      console.error('Aura fetch error:', error)
      return serverError(res, error)
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Aura not found' })
    }

    const d = data[0]
    return res.json({
      ok: true,
      aura: {
        id: d.id,
        user_id: d.user_id,
        title: d.title,
        description: d.description,
        image_urls: d.image_urls,
        archetype_tag: d.archetype_tag,
        heading: d.heading,
        altitude: d.altitude,
        is_verified: d.is_verified,
        created_at: d.created_at,
        lat: d.lat,
        lng: d.lng,
        parent_id: d.parent_id,
        perspective_count: d.perspective_count,
        perspectives: d.perspectives,
        is_saved: d.is_saved,
        like_count: d.like_count,
        is_liked: d.is_liked,
        tags: d.tags ?? [],
        taken_at: d.taken_at ?? null,
        tz_offset: d.tz_offset ?? null,
        gps_accuracy: d.gps_accuracy ?? null,
        gps_timestamp: d.gps_timestamp ?? null,
        place_name: d.place_name ?? null,
        place_id: d.place_id ?? null,
        user: {
          id: d.user_id,
          name: d.user_name,
          email: d.user_email,
          avatar_url: d.user_avatar_url
        }
      }
    })
  } catch (err: any) {
    console.error('Fetch aura error:', err)
    return serverError(res, err)
  }
})

// ========== UPDATE AURA ==========
app.put('/api/auras/:id', authenticateSupabase, async (req: any, res) => {
  try {
    const auraId = req.params.id
    const userId = req.user.id
    const body = req.body
    const editError = validatePostText({ title: body.title, description: body.description, tags: body.tags })
    if (editError) return res.status(400).json({ error: editError })

    // 1. Verify ownership, get current image_urls
    const { data: aura, error: fetchError } = await supabase
      .from('auras')
      .select('user_id, image_urls')
      .eq('id', auraId)
      .single()

    if (fetchError || !aura) return res.status(404).json({ error: 'Aura not found' })
    if (aura.user_id !== userId) return res.status(403).json({ error: 'Forbidden' })

    const updatePayload: Record<string, any> = {}
    if (body.title !== undefined) updatePayload.title = String(body.title)
    if (body.description !== undefined) updatePayload.description = String(body.description)
    if (body.tags !== undefined) updatePayload.tags = Array.isArray(body.tags) ? body.tags : null

    let removedUrls: string[] = []

    if (body.image_urls !== undefined) {
      const existingUrls: string[] = aura.image_urls ?? []
      const existingSet = new Set(existingUrls)

      // Photos can only be removed here, never added — silently drop anything
      // that wasn't already on this aura rather than trusting client-supplied URLs.
      const keptUrls = Array.isArray(body.image_urls)
        ? body.image_urls.filter((url: string) => existingSet.has(url))
        : []

      if (keptUrls.length === 0) {
        return res.status(400).json({ error: 'A post must have at least one image' })
      }

      removedUrls = existingUrls.filter((url) => !keptUrls.includes(url))
      updatePayload.image_urls = keptUrls
    }

    const { data: updated, error: updateError } = await supabase
      .from('auras')
      .update(updatePayload)
      .eq('id', auraId)
      .select()
      .single()

    if (updateError) return serverError(res, updateError)

    // 2. Clean up storage for photos removed from the post
    if (removedUrls.length > 0) {
      const paths = removedUrls
        .map((url) => url.split('/aura-images/')[1])
        .filter(Boolean)
      if (paths.length > 0) await supabase.storage.from('aura-images').remove(paths)
    }

    return res.json({ ok: true, aura: updated })
  } catch (err: any) {
    console.error('Update Aura Error:', err)
    return serverError(res, err)
  }
})

// ========== DELETE AURA ==========
app.delete('/api/auras/:id', authenticateSupabase, async (req: any, res) => {
  try {
    const auraId = req.params.id
    const userId = req.user.id

    // 1. Fetch aura to check ownership and get image URLs + place_id
    const { data: aura, error: fetchError } = await supabase
      .from('auras')
      .select('user_id, image_urls, place_id')
      .eq('id', auraId)
      .single()

    if (fetchError || !aura) return res.status(404).json({ error: 'Aura not found' })
    if (aura.user_id !== userId) return res.status(403).json({ error: 'Forbidden' })

    // Track every place this post or its perspectives belong to, so we can
    // tell afterward whether any of them were left with zero posts.
    const { data: children } = await supabase
      .from('auras')
      .select('place_id')
      .eq('parent_id', auraId)

    const placeIds = Array.from(new Set(
      [aura.place_id, ...(children ?? []).map((c: any) => c.place_id)].filter(Boolean)
    ))

    // 2. Delete images from storage
    if (aura.image_urls?.length > 0) {
      const paths = aura.image_urls
        .map((url: string) => url.split('/aura-images/')[1])
        .filter(Boolean)
      if (paths.length > 0) await supabase.storage.from('aura-images').remove(paths)
    }

    // 3. Delete child perspectives
    await supabase.from('auras').delete().eq('parent_id', auraId)

    // 4. Delete the aura
    const { error: deleteError } = await supabase.from('auras').delete().eq('id', auraId)
    if (deleteError) return serverError(res, deleteError)

    // 5. For each affected place, delete it if it has no posts left; otherwise refresh its cover
    for (const placeId of placeIds) {
      const { count } = await supabase
        .from('auras')
        .select('id', { count: 'exact', head: true })
        .eq('place_id', placeId)

      if (!count) {
        await supabase.from('places').delete().eq('id', placeId)
      } else {
        await supabase.rpc('refresh_place_cover', { p_place_id: placeId })
      }
    }

    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

// ========== PROFILE ROUTES ==========

// Get current user's profile
app.get('/api/profile', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase.rpc('get_user_profile', {
      p_user_id: userId
    })

    if (error) {
      console.error('Profile fetch error:', error)
      return serverError(res, error)
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    return res.json({ ok: true, profile: data[0] })
  } catch (err: any) {
    console.error('Profile error:', err)
    return serverError(res, err)
  }
})

// Update user profile (name and bio)
app.put('/api/profile/update', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id
    const { name, bio } = req.body

    // Validation
    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'Name must be a string' })
      }
      if (name.length > 10) {
        return res.status(400).json({ error: 'Name must be 10 characters or less' })
      }
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string') {
        return res.status(400).json({ error: 'Bio must be a string' })
      }
      if (bio.length > 100) {
        return res.status(400).json({ error: 'Bio must be 100 characters or less' })
      }
    }


    const { error } = await supabase.rpc('update_user_profile', {
      p_user_id: userId,
      p_name: name || null,
      p_bio: bio || null,
      p_avatar_url: null
    })

    if (error) {
      console.error('Profile update error:', error)
      return serverError(res, error)
    }

    return res.json({ ok: true, message: 'Profile updated successfully' })
  } catch (err: any) {
    console.error('Profile update error:', err)
    return serverError(res, err)
  }
})

// Upload profile avatar
app.post('/api/profile/avatar', uploadLimiter, authenticateSupabase, upload.single('avatar'), async (req: any, res) => {
  try {
    const userId = req.user.id
    const file = req.file as Express.Multer.File

    if (!file) {
      return res.status(400).json({ error: 'No avatar file provided' })
    }
    if (!detectImageType(file.buffer)) {
      return res.status(400).json({ error: 'Only JPEG, PNG or WebP images can be uploaded' })
    }


    // Upload to profile-avatars bucket
    const fileName = `${userId}/avatar-${Date.now()}.webp`

    const { error: uploadError } = await supabase.storage
      .from('profile-avatars')
      .upload(fileName, file.buffer, {
        contentType: 'image/webp',
        upsert: true // Overwrite existing avatar
      })

    if (uploadError) {
      console.error('Avatar upload error:', uploadError)
      return serverError(res, uploadError)
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profile-avatars')
      .getPublicUrl(fileName)


    // Update profile with new avatar URL
    const { error: updateError } = await supabase.rpc('update_user_profile', {
      p_user_id: userId,
      p_name: null,
      p_bio: null,
      p_avatar_url: publicUrl
    })

    if (updateError) {
      console.error('Avatar URL update error:', updateError)
      return serverError(res, updateError)
    }

    return res.json({ ok: true, avatar_url: publicUrl })
  } catch (err: any) {
    console.error('Avatar upload error:', err)
    return serverError(res, err)
  }
})

// ========== ACCOUNT ==========
// Permanently deletes the signed-in user's account: posts, photos, avatar,
// follows, likes, saves, notifications, profile, and the login itself.
// Requires { "confirm": "DELETE" } in the body so it can't be triggered by accident.
app.delete('/api/account', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id
    if (req.body?.confirm !== 'DELETE') {
      return res.status(400).json({ error: 'Confirmation required' })
    }

    // 1. Database rows (one transaction)
    const { error: dataError } = await supabase.rpc('delete_user_data', { p_user_id: userId })
    if (dataError) return serverError(res, dataError)

    // 2. Files: everything under the user's folder in both buckets
    for (const bucket of ['aura-images', 'profile-avatars']) {
      for (;;) {
        const { data: files, error: listError } = await supabase.storage.from(bucket).list(userId, { limit: 1000 })
        if (listError) { console.error(`Listing ${bucket} failed:`, listError); break }
        if (!files || files.length === 0) break
        const { error: removeError } = await supabase.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`))
        if (removeError) { console.error(`Removing ${bucket} files failed:`, removeError); break }
        if (files.length < 1000) break
      }
    }

    // 3. The login itself
    const { error: authError } = await supabase.auth.admin.deleteUser(userId)
    if (authError) return serverError(res, authError)

    return res.json({ ok: true })
  } catch (err: any) {
    return serverError(res, err)
  }
})

app.use(uploadErrorHandler)

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Local: http://localhost:${PORT}`)
})