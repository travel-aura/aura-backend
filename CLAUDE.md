# Aura Backend - Development Guide

**Last Updated:** 2026-03-18
**Version:** 1.1.0

## Project Overview
Backend API for Aura platform - a geo-based application for managing location-tagged posts (Auras). Built with Node.js, TypeScript, Express, and Supabase (PostgreSQL + PostGIS).

## Tech Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Express 5.x
- **Database**: Supabase (PostgreSQL + PostGIS for spatial queries)
- **Authentication**: Supabase Auth (JWT-based)
- **Storage**: Supabase Storage (for images)
- **File Upload**: Multer (memory storage, max 5 images)

## Documentation Files
- **`CONTRACT.md`** - Complete API documentation and examples
- **`RLS_FIX.md`** - RLS troubleshooting and permanent fixes
- **`shared/aura-schema.ts`** - Type definitions (shared with frontend)
- **`CLAUDE.md`** - This file (development guide)

## Current Implementation Status

### ✅ Completed Features

#### 1. **Supabase Integration**
- Client initialized in `src/lib/supabase.ts`
- Uses service role key for backend operations
- Configured with `SECURITY DEFINER` to bypass RLS

#### 2. **Authentication System**
- **Register**: `POST /auth/register` - Create new user with Supabase Auth
- **Login**: `POST /auth/login` - Returns JWT access token
- **Logout**: `POST /auth/logout` - Invalidates session
- **Get User**: `GET /me` - Returns current user (requires auth)
- Auth middleware: `src/middleware/auth.ts` validates JWT tokens

#### 3. **Multi-Image Aura Upload** 🆕
- **Endpoint**: `POST /api/auras/upload`
- **Auth Required**: Yes (Bearer token)
- **Functionality**:
  - Accepts multipart/form-data with **up to 5 images** and metadata JSON
  - Uploads all images to Supabase Storage bucket `aura-images`
  - Stores aura data in PostgreSQL with PostGIS location
  - Returns **array of public URLs** for carousel support
  - Enhanced debugging with payload logging

#### 4. **Database Schema** 🆕
```sql
CREATE TABLE auras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title text,
  image_urls text[],                      -- 🆕 Array for multiple images
  archetype_tag text,
  heading float,
  altitude float,
  location geography(POINT, 4326),        -- PostGIS
  is_verified boolean DEFAULT true,
  description text                        -- 🆕 Optional description
)
```

**Key Changes:**
- `image_url` → `image_urls text[]` (supports carousel)
- Added `description` field

#### 5. **PostgreSQL Function (RLS Bypass)**
Created `insert_aura()` function with `SECURITY DEFINER` to bypass RLS:
```sql
CREATE FUNCTION insert_aura(
  p_user_id uuid,
  p_title text,
  p_image_urls text[],           -- 🆕 Array parameter
  p_archetype_tag text,
  p_heading float,
  p_altitude float,
  p_lng float,
  p_lat float,
  p_is_verified boolean,
  p_description text DEFAULT ''  -- 🆕 New parameter
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER                 -- Bypasses RLS
SET search_path = public, pg_temp;
```

#### 6. **Type Safety** 🆕
- **Shared types**: `shared/aura-schema.ts` for frontend/backend
- **Archetype validation**: `'The Angle' | 'The Path' | 'The Spot' | 'The Interior'`
- **Type definitions exported** for frontend consumption

#### 7. **CORS Configuration**
- Allows both development and production origins
- Development origins: localhost:3000/3002/3003/3006, 192.168.1.30:3002/3003, 10.124.57.22:3006
- Production: Cloud Run frontend URL
- Supports credentials for authentication
- Fixed TypeScript compilation errors with proper type guards

#### 8. **Local Network Testing**
- Server binds to `0.0.0.0` (all interfaces)
- Accessible from local network at `http://192.168.1.30:8080`
- Port changed from 5000 to 8080 (avoiding macOS AirPlay conflict)

#### 9. **Read Endpoints** 🆕
- **GET /api/auras/me** - Fetch current user's auras (requires auth)
  - Returns all auras for authenticated user
  - Sorted by `created_at DESC` (most recent first)
  - Extracts lat/lng from PostGIS geography
  - Uses `get_user_auras()` SQL function

- **GET /api/auras/me/stats** - Get user's archetype statistics (requires auth)
  - Returns count of posts by archetype
  - Format: `{ angle: 5, path: 3, spot: 12, interior: 2 }`
  - Uses `get_user_archetype_stats()` SQL function

- **GET /api/auras/feed** - Public feed with pagination (no auth required)
  - Query params: `limit` (default 10), `offset` (default 0)
  - Returns newest auras from all users
  - Supports infinite scroll
  - Uses `get_all_auras()` SQL function

#### 10. **SQL Functions for Data Retrieval** 🆕
Created three PostgreSQL functions with `SECURITY DEFINER`:
- `get_user_auras(p_user_id)` - Returns user's auras with lat/lng extracted
- `get_user_archetype_stats(p_user_id)` - Returns archetype counts
- `get_all_auras(p_limit, p_offset)` - Returns paginated feed

## Environment Variables

Required in `.env`:
```
PORT=8080
SUPABASE_URL=https://whsfuaidysfcpduohlyw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
CORS_ORIGIN=https://aura-frontend-255644230597.us-central1.run.app
```

## API Endpoints

### Authentication
```
POST /auth/register
Body: { email: string, password: string }
Response: { ok: true, user: {...}, session: { access_token: string } }

POST /auth/login
Body: { email: string, password: string }
Response: { ok: true, user: {...}, session: { access_token: string } }

POST /auth/logout
Headers: { Authorization: Bearer <token> }
Response: { ok: true }

GET /me
Headers: { Authorization: Bearer <token> }
Response: { ok: true, user: {...} }
```

### Aura Endpoints

#### Upload (Multiple Images)
```
POST /api/auras/upload
Headers: { Authorization: Bearer <token> }
Body: FormData {
  images: File[],  // Max 5 images
  metadata: JSON string {
    title: string,
    description?: string,
    archetype_tag: string,
    heading?: number,
    altitude?: number,              // Changed from 'alt' for consistency
    lng?: number,
    lat?: number,
    is_verified: boolean
  }
}
Response: { success: true, urls: string[] }
```

#### Get User's Auras
```
GET /api/auras/me
Headers: { Authorization: Bearer <token> }
Response: {
  ok: true,
  auras: [{
    id: string,
    user_id: string,
    title: string,
    description: string,
    image_urls: string[],
    archetype_tag: string,
    heading: number,
    altitude: number,
    is_verified: boolean,
    created_at: string,
    lat: number,
    lng: number
  }]
}
```

#### Get User's Archetype Stats
```
GET /api/auras/me/stats
Headers: { Authorization: Bearer <token> }
Response: {
  ok: true,
  stats: {
    angle: number,
    path: number,
    spot: number,
    interior: number
  }
}
```

#### Get Public Feed
```
GET /api/auras/feed?limit=10&offset=0
Response: {
  ok: true,
  auras: [...],  // Same structure as /api/auras/me
  pagination: {
    limit: number,
    offset: number,
    count: number
  }
}
```

**See `CONTRACT.md` for complete API documentation with examples**

## Important Implementation Details

### Type Conversion in Upload
All metadata is explicitly typed before database insert to prevent type errors:
```typescript
const payload = {
  p_user_id: userId,                                    // From verified JWT
  p_title: String(metadata.title || 'Untitled'),
  p_image_urls: publicUrls,                             // Array of URLs
  p_archetype_tag: String(metadata.archetype_tag || 'none'),
  p_heading: Number(metadata.heading) || 0,
  p_altitude: Number(metadata.altitude) || 0,           // Consistent naming with DB
  p_lng: Number(metadata.lng) || 0,                     // Critical for PostGIS
  p_lat: Number(metadata.lat) || 0,                     // Critical for PostGIS
  p_is_verified: !!metadata.is_verified,
  p_description: String(metadata.description || '')
};
```

**Why explicit type conversion?**
- `Number()` ensures PostGIS receives float, not string
- `String()` prevents `null` or `undefined` in database
- `!!` converts any truthy value to strict boolean

### Enhanced Debugging 🆕
Upload endpoint logs payload on error:
```typescript
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
```

### RLS Policy Configuration
- **Database RLS**: Disabled on `auras` table for development
- **Storage RLS**: Disabled on `storage.objects` for development
- **Both must be disabled** to avoid "RLS violation" errors

When re-enabling for production:
```sql
-- Table policy
CREATE POLICY "Allow authenticated inserts" ON auras
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Storage policy (via Dashboard UI)
-- Allow authenticated users to upload to their folder
```

### Storage Bucket
- **Name**: `aura-images`
- **Public access**: Enabled
- **File path pattern**: `{userId}/{timestamp}-{random}.webp`
- **Max images**: 5 per upload
- **RLS**: Disabled for development

## Known Issues & Solutions

### ⚠️ CRITICAL: RLS Policy Errors (RECURRING ISSUE)

**Error**: `new row violates row-level security policy`

**Why This Keeps Happening**:
- Schema changes (ALTER TABLE ADD COLUMN) can re-enable RLS
- Multiple conflicting policies
- Function loses SECURITY DEFINER after recreation

**PERMANENT FIX** (See RLS_FIX.md for complete script):
```sql
-- 1. Disable RLS completely
ALTER TABLE auras DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL policies
DROP POLICY IF EXISTS "Auras are public" ON auras;
DROP POLICY IF EXISTS "Users can create their own Auras" ON auras;
DROP POLICY IF EXISTS "Allow authenticated inserts" ON auras;
DROP POLICY IF EXISTS "Allow all inserts" ON auras;

-- 3. Ensure function has SECURITY DEFINER
CREATE OR REPLACE FUNCTION insert_aura(...)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- CRITICAL
SET search_path = public, pg_temp  -- PREVENTS SECURITY ISSUES
AS $$ ... $$;
```

**Prevention**: After ANY schema change, always run:
```sql
ALTER TABLE auras DISABLE ROW LEVEL SECURITY;
```

See `RLS_FIX.md` for the complete fix script.

---

### Issue: Port 5000 blocked by macOS AirPlay
**Solution**: Use port 8080 instead

### Issue: Type mismatch on lat/lng
**Solution**: Use `Number()` for all numeric values with fallback `|| 0`

### Issue: Storage RLS blocking uploads (COMMON!) 🆕
**Error**: `StorageApiError: new row violates row-level security policy`

**Why**: The `aura-images` bucket has RLS enabled

**Solution**: Disable Storage RLS via Supabase Dashboard UI:
1. Go to Storage → aura-images bucket
2. Toggle OFF "Enable RLS"

**Or via SQL** (may require superuser):
```sql
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
```

**Debugging Tip**: Check error stack trace
- Contains `storage-js` → Storage RLS issue
- Contains `RPC Error` → Database RLS issue

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (auto-reload)
npm run build        # Build TypeScript
npm start            # Start production server
```

## Deployment (Cloud Run)

Files ready:
- `Dockerfile` - Multi-stage build
- `.dockerignore` - Optimizes image size
- `deploy.sh` - Deployment script

Deploy command:
```bash
gcloud run deploy aura-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,CORS_ORIGIN=..."
```

## File Structure
```
aura-backend/
├── src/
│   ├── index.ts              # Main server & routes
│   ├── lib/
│   │   └── supabase.ts      # Supabase client
│   └── middleware/
│       └── auth.ts          # JWT authentication middleware
├── shared/                   # 🆕 Shared with frontend
│   └── aura-schema.ts       # Type definitions
├── CONTRACT.md              # 🆕 API documentation
├── CLAUDE.md                # This file (dev guide)
├── RLS_FIX.md               # 🆕 RLS troubleshooting
├── Dockerfile               # Production deployment
├── deploy.sh                # Cloud Run deployment script
├── .env                     # Environment variables (gitignored)
├── .env.example             # Environment template
└── package.json             # Dependencies & scripts
```

## TODO / Missing Features

### High Priority
- [ ] GET /api/auras/:id - Fetch single aura by ID
- [ ] GET /api/auras/nearby - Spatial query (PostGIS `ST_DWithin`)
- [ ] GET /api/auras/bbox - Bounding box query for map viewport
- [ ] Saves & verifications functionality

### Medium Priority
- [ ] Input validation with Zod (schema ready in `shared/aura-schema.ts`)
- [ ] Error handling improvements
- [ ] Rate limiting (prevent abuse)
- [ ] Logging system (Winston or Pino)
- [ ] Image optimization/compression before upload

### Low Priority
- [ ] Re-enable RLS with proper policies for production
- [ ] Unit tests (Jest + Supertest)
- [ ] API versioning (e.g., /v1/api/auras)
- [ ] WebSocket support for real-time updates

### ✅ Recently Completed (2026-03-18)
- [x] GET /api/auras/feed - Paginated public feed with infinite scroll
- [x] GET /api/auras/me - Fetch current user's auras
- [x] GET /api/auras/me/stats - User's archetype statistics
- [x] TypeScript compilation fixes (CORS and PORT types)
- [x] Consistent field naming (altitude instead of alt)
- [x] Complete type definitions in shared schema
- [x] SQL functions for data retrieval (get_user_auras, get_user_archetype_stats, get_all_auras)
- [x] Multi-image upload (up to 5 images)
- [x] Enhanced debugging with payload logging
- [x] Type safety with shared schema
- [x] Comprehensive documentation (CONTRACT.md, RLS_FIX.md)
- [x] Description field support

## Notes for Future Development

1. **PostGIS Spatial Queries**:
   ```sql
   -- Find auras within 5km
   SELECT * FROM auras
   WHERE ST_DWithin(
     location,
     ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography,
     5000  -- 5km in meters
   );
   ```

2. **Authentication**:
   - Frontend must send `Authorization: Bearer <token>` header
   - Token obtained from `session.access_token` after login/register
   - Token expires in 1 hour (configurable in Supabase)

3. **Frontend Integration**:
   - Local: `http://192.168.1.30:8080`
   - Production: `https://aura-backend-255644230597.us-central1.run.app`
   - Type sharing: Import from `shared/aura-schema.ts`

4. **Supabase Configuration**:
   - Email confirmation: Disabled for development
   - Storage RLS: Disabled for development
   - Database RLS: Disabled for development
   - Service role key: Never expose to frontend!

5. **Type Sharing Between Frontend/Backend**:
   ```typescript
   // Both can import from shared/
   import { Aura, AuraUploadPayload, Archetype } from '../shared/aura-schema';
   ```

6. **Carousel Implementation**:
   - `image_urls` is an array - loop through for carousel
   - First image is primary/thumbnail
   - Maximum 5 images per aura

## Production Checklist

### Security
- [ ] Enable email confirmation in Supabase Auth
- [ ] Re-enable RLS on database with proper policies
- [ ] Re-enable RLS on Storage with proper policies
- [ ] Use restricted CORS origins (remove `origin: true`)
- [ ] Rotate service role key if exposed
- [ ] Add rate limiting middleware
- [ ] Enable HTTPS only (`secure: true` on cookies)
- [ ] Add input validation with Zod
- [ ] Sanitize user input to prevent XSS

### Infrastructure
- [ ] Set `NODE_ENV=production`
- [ ] Configure secrets in Cloud Run (not in code)
- [ ] Set up proper logging/monitoring (Cloud Logging)
- [ ] Add health check endpoint (`GET /health`)
- [ ] Set up error tracking (Sentry)
- [ ] Configure auto-scaling
- [ ] Set up database backups

### CI/CD
- [ ] Set up GitHub Actions or Cloud Build
- [ ] Automated tests on PR
- [ ] Automated deployment to staging
- [ ] Manual approval for production deploy
- [ ] Rollback strategy

### Performance
- [ ] Add caching layer (Redis)
- [ ] Optimize database queries
- [ ] Add database indexes
- [ ] Compress images before storage
- [ ] Enable CDN for images
- [ ] Add pagination to all list endpoints

### Monitoring
- [ ] Set up uptime monitoring
- [ ] Configure alerts for errors
- [ ] Track API response times
- [ ] Monitor database connection pool
- [ ] Track storage usage

---

## Quick Reference

**Key Commands:**
```bash
npm run dev          # Local development
npm run build        # Build for production
npm start            # Run production build
```

**Important URLs:**
- Local: http://192.168.1.30:8080
- Production: https://aura-backend-255644230597.us-central1.run.app
- Supabase: https://whsfuaidysfcpduohlyw.supabase.co

**Documentation:**
- API docs: `CONTRACT.md`
- RLS fixes: `RLS_FIX.md`
- Types: `shared/aura-schema.ts`
- This guide: `CLAUDE.md`
