import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import { supabase } from './lib/supabase'
import { authenticateSupabase } from './middleware/auth'

dotenv.config()

const app = express()
const PORT = parseInt(process.env.PORT || '8080', 10)

// CORS configuration - Allow both development and production origins
const allowedOrigins = [
  // Production
  'https://aura-frontend-255644230597.us-central1.run.app',
  process.env.CORS_ORIGIN,
  // Development - New IP
  'http://10.126.30.88:3000',
  'http://10.126.30.88:3001',
  'http://10.126.30.88:3002',
  'http://10.126.30.88:3003',
  'http://10.126.30.88:3006',
  // Development - Old IPs (keep for compatibility)
  'http://10.124.57.22:3000',
  'http://10.124.57.22:3001',
  'http://10.124.57.22:3006',
  'http://192.168.1.30:3002',
  'http://192.168.1.30:3003',
  // Localhost
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3006'
].filter((origin): origin is string => Boolean(origin))

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
)
app.use(express.json())

// Multer setup for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() })

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

    const { data, error } = await supabase.auth.signUp({
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
    return res.status(500).json({ error: err.message })
  }
})

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const { data, error } = await supabase.auth.signInWithPassword({
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
    return res.status(500).json({ error: err.message })
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
    return res.status(500).json({ error: err.message })
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
      return res.status(500).json({ error: error.message })
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    return res.json({ ok: true, user: data[0] })
  } catch (err: any) {
    console.error('/me error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// ========== AURA UPLOAD ROUTE ==========
app.post('/api/auras/upload', authenticateSupabase, upload.array('images', 5), async (req: any, res) => {
  try {
    const files = req.files as Express.Multer.File[]

    // Safety check: ensure metadata exists
    if (!req.body.metadata) return res.status(400).json({ error: 'Metadata is missing' });
    const metadata = JSON.parse(req.body.metadata)

    const userId = req.user.id

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images provided' })
    }

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

    // 2. Reverse geocode city name from lat/lng
    let cityName: string | null = null
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN
    console.log('Geocoding check — lat:', metadata.lat, 'lng:', metadata.lng, 'token:', !!mapboxToken)
    if (metadata.lat && metadata.lng && mapboxToken) {
      try {
        const geocodeRes = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${metadata.lng},${metadata.lat}.json?access_token=${mapboxToken}`
        )
        const geocodeData = await geocodeRes.json() as any
        console.log('Mapbox raw:', JSON.stringify(geocodeData).slice(0, 500))
        const feature = geocodeData.features?.[0]
        console.log('Mapbox feature:', JSON.stringify(feature?.place_type), 'context:', JSON.stringify(feature?.context?.map((c: any) => c.id)))
        const placeCtx = feature?.context?.find((c: any) =>
          c.id?.startsWith('place.') || c.id?.startsWith('locality.') || c.id?.startsWith('district.')
        )
        cityName = placeCtx?.text ?? null
        console.log('Geocoding result:', cityName)
      } catch (e) {
        console.error('Mapbox geocoding failed:', e)
      }
    }

    if (cityName) {
      await supabase.rpc('upsert_user_city', { p_user_id: userId, p_city_name: cityName })
    }

    // 3. Save the ARRAY of URLs to the DB
    // IMPORTANT: Every key here must match the SQL "p_" names exactly!
    const payload = {
      p_user_id: userId,
      p_title: String(metadata.title || 'Untitled'),
      p_image_urls: publicUrls,
      p_archetype_tag: String(metadata.archetype_tag || 'none'),
      p_heading: Number(metadata.heading) || 0,
      p_altitude: Number(metadata.altitude) || 0,
      p_lng: Number(metadata.lng) || 0,
      p_lat: Number(metadata.lat) || 0,
      p_is_verified: !!metadata.is_verified,
      p_description: String(metadata.description || ''),
      p_parent_id: metadata.parent_id || null,
      p_tags: Array.isArray(metadata.tags) ? metadata.tags : null,
      p_city_name: cityName
    };

    const { error: dbError } = await supabase.rpc('insert_aura', payload);

    if (dbError) {
      console.log("CRITICAL DEBUG: RPC Failed");
      console.log("Payload sent to DB:", JSON.stringify(payload, null, 2));
      console.log("Full Error Object:", dbError);
      return res.status(500).json({
        error: dbError.message,
        hint: dbError.hint,
        details: dbError.details
      });
    }

    return res.status(200).json({ success: true, urls: publicUrls })
  } catch (err: any) {
    console.error('Upload Error Details:', err)
    return res.status(500).json({ error: err.message })
  }
})

// ========== GET USER'S AURAS ==========
app.get('/api/auras/me', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id
    console.log('Fetching auras for user:', userId)

    // Use RPC to properly extract lat/lng from PostGIS geography
    const { data, error } = await supabase.rpc('get_user_auras', {
      p_user_id: userId
    })

    if (error) {
      console.error('Database error:', error)
      return res.status(500).json({ error: error.message })
    }

    console.log(`Found ${data?.length || 0} auras for user ${userId}`)
    return res.json({ ok: true, auras: data || [] })
  } catch (err: any) {
    console.error('Fetch auras error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// ========== GET USER'S ARCHETYPE STATS ==========
app.get('/api/auras/me/stats', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id
    console.log('Fetching archetype stats for user:', userId)

    const { data, error } = await supabase.rpc('get_user_stats', { p_user_id: userId })

    if (error) {
      console.error('Stats database error:', error)
      return res.status(500).json({ error: error.message })
    }

    const row = data?.[0]
    const stats = {
      photo_spots:    Number(row?.photo_spots    ?? 0),
      wanderings:     Number(row?.wanderings     ?? 0),
      indoor_vibes:   Number(row?.indoor_vibes   ?? 0),
      city_count:     Number(row?.city_count     ?? 0),
      verified_count: Number(row?.verified_count ?? 0),
      follower_count: Number(row?.follower_count ?? 0),
      top_tags:       (row?.top_tags ?? []) as string[],
    }

    console.log('Stats:', stats)
    return res.json({ ok: true, stats })
  } catch (err: any) {
    console.error('Fetch stats error:', err)
    return res.status(500).json({ error: err.message })
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
      return res.status(500).json({ error: error.message })
    }

    return res.json({ ok: true, nearby: data || [] })
  } catch (err: any) {
    console.error('Nearby check error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// ========== GET FEED (ALL AURAS WITH PAGINATION + SPATIAL + ARCHETYPE FILTER) ==========
const archetypeMap: Record<string, string> = {
  'PhotoSpots': 'Photo Spots',
  'Wanderings': 'Wanderings',
  'IndoorVibes': 'Indoor Vibes'
}

app.get('/api/auras/feed', async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10
    const offset = parseInt(req.query.offset as string) || 0
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : null
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : null
    const radius = parseFloat(req.query.radius as string) || 5000
    const archetypeRaw = req.query.archetype as string | undefined
    const archetype = archetypeRaw ? (archetypeMap[archetypeRaw] || archetypeRaw) : null
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
      p_archetype: archetype,
      p_follower_id: followerId,
      p_viewer_id: viewerId,
      p_tag: tag,
      p_query: query
    })

    if (error) {
      console.error('Feed database error:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.json({
      ok: true,
      auras: data || [],
      pagination: { limit, offset, count: data?.length || 0 }
    })
  } catch (err: any) {
    console.error('Fetch feed error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// ========== FOLLOWS ==========
app.get('/api/users/search', authenticateSupabase, async (req: any, res) => {
  try {
    const q = req.query.q as string
    if (!q || q.trim().length === 0) return res.status(400).json({ error: 'q is required' })
    const { data, error } = await supabase.rpc('search_users', {
      p_query: q.trim(),
      p_current_user_id: req.user.id
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ users: data || [] })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
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
    if (error) return res.status(500).json({ error: error.message })
    // Create follow notification for the person being followed
    await supabase.rpc('create_notification', {
      p_recipient_id: user_id,
      p_actor_id: req.user.id,
      p_type: 'follow'
    })
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

app.delete('/api/follows/:user_id', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('unfollow_user', {
      p_follower_id: req.user.id,
      p_following_id: req.params.user_id
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', authenticateSupabase, async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_notifications', {
      p_user_id: req.user.id
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, notifications: data || [] })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

app.patch('/api/notifications/read', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('mark_notifications_read', {
      p_user_id: req.user.id
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
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

    if (profileResult.error) return res.status(500).json({ error: profileResult.error.message })
    if (!profileResult.data || profileResult.data.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const statsRow = statsResult.data?.[0]
    const stats = {
      photo_spots:    Number(statsRow?.photo_spots    ?? 0),
      wanderings:     Number(statsRow?.wanderings     ?? 0),
      indoor_vibes:   Number(statsRow?.indoor_vibes   ?? 0),
      city_count:     Number(statsRow?.city_count     ?? 0),
      verified_count: Number(statsRow?.verified_count ?? 0),
      follower_count: Number(statsRow?.follower_count ?? 0),
    }

    return res.json({
      ok: true,
      profile: profileResult.data[0],
      posts: postsResult.data || [],
      stats
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ========== SAVES (frontend URL pattern: /api/saves) ==========
app.get('/api/saves', authenticateSupabase, async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_saved_auras', { p_user_id: req.user.id })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, auras: data || [] })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
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
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ saved: !!data })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/saves', authenticateSupabase, async (req: any, res) => {
  try {
    const { aura_id } = req.body
    if (!aura_id) return res.status(400).json({ error: 'aura_id required' })
    const { error } = await supabase.rpc('save_aura', { p_user_id: req.user.id, p_aura_id: aura_id })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

app.delete('/api/saves/:aura_id', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('unsave_aura', {
      p_user_id: req.user.id,
      p_aura_id: req.params.aura_id
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ========== LIKES ==========
app.post('/api/likes', authenticateSupabase, async (req: any, res) => {
  try {
    const { aura_id } = req.body
    if (!aura_id) return res.status(400).json({ error: 'aura_id required' })

    const { error } = await supabase.rpc('like_aura', { p_user_id: req.user.id, p_aura_id: aura_id })
    if (error) return res.status(500).json({ error: error.message })

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
    return res.status(500).json({ error: err.message })
  }
})

app.delete('/api/likes/:aura_id', authenticateSupabase, async (req: any, res) => {
  try {
    const { error } = await supabase.rpc('unlike_aura', {
      p_user_id: req.user.id,
      p_aura_id: req.params.aura_id
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ========== PERSPECTIVES ==========
app.get('/api/auras/:id/perspectives', async (req: any, res) => {
  try {
    const { data, error } = await supabase.rpc('get_aura_perspectives', {
      p_parent_id: req.params.id
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, perspectives: data || [] })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ========== GET SINGLE AURA BY ID ==========
app.get('/api/auras/:id', async (req: any, res) => {
  try {
    const auraId = req.params.id

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
      return res.status(500).json({ error: error.message })
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
    return res.status(500).json({ error: err.message })
  }
})

// ========== DELETE AURA ==========
app.delete('/api/auras/:id', authenticateSupabase, async (req: any, res) => {
  try {
    const auraId = req.params.id
    const userId = req.user.id

    // 1. Fetch aura to check ownership and get image URLs
    const { data: aura, error: fetchError } = await supabase
      .from('auras')
      .select('user_id, image_urls')
      .eq('id', auraId)
      .single()

    if (fetchError || !aura) return res.status(404).json({ error: 'Aura not found' })
    if (aura.user_id !== userId) return res.status(403).json({ error: 'Forbidden' })

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
    if (deleteError) return res.status(500).json({ error: deleteError.message })

    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ========== PROFILE ROUTES ==========

// Get current user's profile
app.get('/api/profile', authenticateSupabase, async (req: any, res) => {
  try {
    const userId = req.user.id
    console.log('Fetching profile for user:', userId)

    const { data, error } = await supabase.rpc('get_user_profile', {
      p_user_id: userId
    })

    if (error) {
      console.error('Profile fetch error:', error)
      return res.status(500).json({ error: error.message })
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    return res.json({ ok: true, profile: data[0] })
  } catch (err: any) {
    console.error('Profile error:', err)
    return res.status(500).json({ error: err.message })
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

    console.log(`Updating profile for user ${userId}:`, { name, bio })

    const { error } = await supabase.rpc('update_user_profile', {
      p_user_id: userId,
      p_name: name || null,
      p_bio: bio || null,
      p_avatar_url: null
    })

    if (error) {
      console.error('Profile update error:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.json({ ok: true, message: 'Profile updated successfully' })
  } catch (err: any) {
    console.error('Profile update error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// Upload profile avatar
app.post('/api/profile/avatar', authenticateSupabase, upload.single('avatar'), async (req: any, res) => {
  try {
    const userId = req.user.id
    const file = req.file as Express.Multer.File

    if (!file) {
      return res.status(400).json({ error: 'No avatar file provided' })
    }

    console.log('Uploading avatar for user:', userId)

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
      return res.status(500).json({ error: uploadError.message })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profile-avatars')
      .getPublicUrl(fileName)

    console.log('Avatar uploaded:', publicUrl)

    // Update profile with new avatar URL
    const { error: updateError } = await supabase.rpc('update_user_profile', {
      p_user_id: userId,
      p_name: null,
      p_bio: null,
      p_avatar_url: publicUrl
    })

    if (updateError) {
      console.error('Avatar URL update error:', updateError)
      return res.status(500).json({ error: updateError.message })
    }

    return res.json({ ok: true, avatar_url: publicUrl })
  } catch (err: any) {
    console.error('Avatar upload error:', err)
    return res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Local: http://localhost:${PORT}`)
  console.log(`Network: http://10.126.30.88:${PORT}`)
})