import multer from 'multer'
import rateLimit from 'express-rate-limit'
import type { Request, Response, NextFunction } from 'express'

// ── Uploads ──────────────────────────────────────────────────────────────────
// The app compresses photos to WebP (at most ~4 MB each, 512 px avatars), so
// these caps only stop abuse: oversized files, too many files, non-images.

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_POST_IMAGES = 3

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_POST_IMAGES, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname))
  },
})

// Checks the file's actual bytes, not just the type the browser claims.
export function detectImageType(buf: Buffer): 'image/webp' | 'image/jpeg' | 'image/png' | null {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png'
  return null
}

// Turns multer errors into a clear 400 instead of a 500.
export function uploadErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: `Each photo must be under ${MAX_FILE_BYTES / 1024 / 1024} MB`,
      LIMIT_FILE_COUNT: `You can upload up to ${MAX_POST_IMAGES} photos`,
      LIMIT_UNEXPECTED_FILE: 'Only image files can be uploaded',
    }
    return res.status(400).json({ error: messages[err.code] ?? 'Upload rejected' })
  }
  return next(err)
}

// ── Text ─────────────────────────────────────────────────────────────────────

export const MAX_TITLE = 100
export const MAX_DESCRIPTION = 1000
export const MAX_TAGS = 5
export const MAX_TAG_LENGTH = 40

// Returns an error message, or null if the post text is acceptable.
export function validatePostText(input: { title?: unknown; description?: unknown; tags?: unknown }): string | null {
  const { title, description, tags } = input
  if (title !== undefined && title !== null && String(title).length > MAX_TITLE) {
    return `Title must be ${MAX_TITLE} characters or less`
  }
  if (description !== undefined && description !== null && String(description).length > MAX_DESCRIPTION) {
    return `Description must be ${MAX_DESCRIPTION} characters or less`
  }
  if (tags !== undefined && tags !== null) {
    if (!Array.isArray(tags)) return 'Tags must be a list'
    if (tags.length > MAX_TAGS) return `Up to ${MAX_TAGS} tags`
    if (tags.some((t) => typeof t !== 'string' || t.length === 0 || t.length > MAX_TAG_LENGTH)) return 'Invalid tag'
  }
  return null
}

// ── Rate limits (per IP) ─────────────────────────────────────────────────────

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: message } })

// Login, register, Google sign-in, refresh: stops password guessing.
export const authLimiter = limiter(15 * 60 * 1000, 30, 'Too many sign-in attempts. Try again in 15 minutes.')
// Uploads: stops spam.
export const uploadLimiter = limiter(60 * 60 * 1000, 40, 'Upload limit reached. Try again in an hour.')
// Everything else: generous, just stops runaway scripts.
export const apiLimiter = limiter(60 * 1000, 300, 'Too many requests. Slow down a little.')
