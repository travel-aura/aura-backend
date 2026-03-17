import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import { supabase } from './lib/supabase'
import { authenticateSupabase } from './middleware/auth'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// CORS configuration - Allow all origins in development, specific in production
const isDevelopment = process.env.NODE_ENV !== 'production'

app.use(
  cors({
    origin: isDevelopment ? true : [
      'https://aura-frontend-255644230597.us-central1.run.app',
      process.env.CORS_ORIGIN
    ],
    credentials: true,
  })
)
app.use(express.json())

// Multer setup for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() })

app.get('/', (req, res) => {
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

app.get('/me', authenticateSupabase, (req: any, res) => {
  return res.json({ ok: true, user: req.user })
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
      p_altitude: Number(metadata.alt) || 0,
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Local: http://localhost:${PORT}`)
  console.log(`Network: http://192.168.1.30:${PORT}`)
})