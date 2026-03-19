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
  // Development
  'http://192.168.1.30:3002',
  'http://192.168.1.30:3003',
  'http://10.124.57.22:3000',
  'http://10.124.57.22:3001',
  'http://10.124.57.22:3006',
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

    // 2. Save the ARRAY of URLs to the DB
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
      p_description: String(metadata.description || '')
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

    const { data, error } = await supabase.rpc('get_user_archetype_stats', {
      p_user_id: userId
    })

    if (error) {
      console.error('Stats database error:', error)
      return res.status(500).json({ error: error.message })
    }

    // Transform array result into stats object
    const stats = {
      angle: 0,
      path: 0,
      spot: 0,
      interior: 0
    }

    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        switch (row.archetype_tag) {
          case 'The Angle':
            stats.angle = row.count
            break
          case 'The Path':
            stats.path = row.count
            break
          case 'The Spot':
            stats.spot = row.count
            break
          case 'The Interior':
            stats.interior = row.count
            break
        }
      })
    }

    console.log('Archetype stats:', stats)
    return res.json({ ok: true, stats })
  } catch (err: any) {
    console.error('Fetch stats error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// ========== GET FEED (ALL AURAS WITH PAGINATION) ==========
app.get('/api/auras/feed', async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10
    const offset = parseInt(req.query.offset as string) || 0

    console.log(`Fetching feed: limit=${limit}, offset=${offset}`)

    const { data, error } = await supabase.rpc('get_all_auras', {
      p_limit: limit,
      p_offset: offset
    })

    if (error) {
      console.error('Feed database error:', error)
      return res.status(500).json({ error: error.message })
    }

    console.log(`Fetched ${data?.length || 0} auras for feed`)
    return res.json({
      ok: true,
      auras: data || [],
      pagination: {
        limit,
        offset,
        count: data?.length || 0
      }
    })
  } catch (err: any) {
    console.error('Fetch feed error:', err)
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
  console.log(`Network: http://10.124.57.22:${PORT}`)
})