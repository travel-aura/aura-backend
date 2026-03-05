import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
)
app.use(express.json())
app.use(cookieParser())

app.get('/', (req, res) => {
  res.json({ message: 'Aura Backend Running' })
})

/**
 * EASIEST AUTH: in-memory users (dev only)
 * Replace with DB later.
 */
type User = {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

const usersByEmail = new Map<string, User>()

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'
const COOKIE_NAME = 'aura_token'

function hashPassword(password: string) {
  // Simple hash for MVP; replace with bcrypt in production
  return crypto.createHash('sha256').update(password).digest('hex')
}

function signToken(payload: { userId: string; email: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
    ;(req as any).user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

app.post('/auth/register', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 chars' })

  const normalizedEmail = email.trim().toLowerCase()
  if (usersByEmail.has(normalizedEmail)) return res.status(409).json({ error: 'email already exists' })

  const user: User = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  }
  usersByEmail.set(normalizedEmail, user)

  const token = signToken({ userId: user.id, email: user.email })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true behind HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

  return res.json({ ok: true, user: { id: user.id, email: user.email } })
})

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  const normalizedEmail = email.trim().toLowerCase()
  const user = usersByEmail.get(normalizedEmail)
  if (!user) return res.status(401).json({ error: 'invalid credentials' })

  if (user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'invalid credentials' })
  }

  const token = signToken({ userId: user.id, email: user.email })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

  return res.json({ ok: true, user: { id: user.id, email: user.email } })
})

app.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME)
  res.json({ ok: true })
})

app.get('/me', authMiddleware, (req, res) => {
  const user = (req as any).user as { userId: string; email: string }
  res.json({ ok: true, user })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})