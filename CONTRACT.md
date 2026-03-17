# API Contract - Aura Backend

**Version:** 1.0.0
**Updated:** 2026-03-17
**Base URL (Local):** `http://192.168.1.30:8080`
**Base URL (Production):** `https://aura-backend-255644230597.us-central1.run.app`

---

## Authentication

All authenticated endpoints require a JWT token from Supabase Auth.

**Header Format:**
```
Authorization: Bearer <access_token>
```

**Getting a token:**
1. Register or login via `/auth/register` or `/auth/login`
2. Extract `session.access_token` from response
3. Include in `Authorization` header for protected routes

---

## Endpoints

### 🔓 Public Endpoints

#### `GET /`
**Purpose:** Health check

**Response:**
```json
{
  "message": "Aura Backend Running"
}
```

---

### 🔐 Authentication Endpoints

#### `POST /auth/register`
**Purpose:** Create a new user account

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Validation:**
- `email`: Required, valid email format
- `password`: Required, minimum 6 characters

**Response (Success):**
```json
{
  "ok": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    ...
  },
  "session": {
    "access_token": "eyJhbGc...",
    "refresh_token": "...",
    "expires_in": 3600
  }
}
```

**Response (Error):**
```json
{
  "error": "Email already exists"
}
```

---

#### `POST /auth/login`
**Purpose:** Login existing user

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** Same as register

**Errors:**
- `401`: Invalid credentials
- `400`: Email not confirmed (if email confirmation enabled)

---

#### `POST /auth/logout`
**Purpose:** Logout user and invalidate session

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "ok": true
}
```

---

#### `GET /me`
**Purpose:** Get current user information

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "aud": "authenticated",
    "role": "authenticated",
    ...
  }
}
```

---

### 📸 Aura Endpoints

#### `POST /api/auras/upload`
**Purpose:** Upload images to Supabase Storage and create an Aura in the database

**Authentication:** Required

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form Data:**
- `images`: Array of image files (max 5, WebP format recommended)
- `metadata`: JSON string containing aura metadata

**Metadata Schema:**
```typescript
{
  title: string;              // Required
  description?: string;       // Optional
  archetype_tag: string;      // One of: 'The Angle', 'The Path', 'The Spot', 'The Interior'
  lat: number;                // Required, -90 to 90
  lng: number;                // Required, -180 to 180
  heading?: number;           // Optional, compass heading 0-360
  alt?: number;               // Optional, GPS altitude
  is_verified: boolean;       // Optional, defaults to false
}
```

**Example Request (JavaScript):**
```javascript
const formData = new FormData();

// Add images
formData.append('images', imageFile1);
formData.append('images', imageFile2);
formData.append('images', imageFile3);

// Add metadata
const metadata = {
  title: "Golden Gate View",
  description: "Beautiful sunset view",
  archetype_tag: "The Spot",
  lat: 37.8199,
  lng: -122.4783,
  heading: 270,
  alt: 67.5,
  is_verified: false
};
formData.append('metadata', JSON.stringify(metadata));

// Send request
const response = await fetch('http://192.168.1.30:8080/api/auras/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});
```

**Backend Processing:**
1. ✅ Validates JWT token (via `authenticateSupabase` middleware)
2. ✅ Extracts `user_id` from verified token
3. ✅ Uploads all images to `aura-images` Supabase Storage bucket
   - File path: `{user_id}/{timestamp}-{random}.webp`
   - Returns public URLs
4. ✅ Converts lat/lng to PostGIS `POINT(lng, lat)` geography
5. ✅ Calls `insert_aura()` PostgreSQL function with `SECURITY DEFINER`
6. ✅ Inserts record into `auras` table with all metadata

**Response (Success):**
```json
{
  "success": true,
  "urls": [
    "https://whsfuaidysfcpduohlyw.supabase.co/storage/v1/object/public/aura-images/user-id/1234567890-abc.webp",
    "https://whsfuaidysfcpduohlyw.supabase.co/storage/v1/object/public/aura-images/user-id/1234567891-def.webp"
  ]
}
```

**Response (Error):**
```json
{
  "error": "No images provided"
}
```
```json
{
  "error": "Metadata is missing"
}
```
```json
{
  "error": "new row violates row-level security policy",
  "hint": "...",
  "details": "..."
}
```

**Errors:**
- `400`: Missing images or metadata
- `401`: Invalid or missing JWT token
- `500`: Storage upload failed or database error

---

## Type Definitions

See `shared/aura-schema.ts` for complete TypeScript definitions:

```typescript
export type Archetype = 'The Angle' | 'The Path' | 'The Spot' | 'The Interior';

export interface Aura {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  image_urls: string[];
  archetype_tag: Archetype;
  lat: number;
  lng: number;
  heading: number;
  altitude: number;
  is_verified: boolean;
  created_at: string;
}

export interface AuraUploadPayload {
  metadata: {
    title: string;
    description?: string;
    archetype_tag: Archetype;
    lat: number;
    lng: number;
    heading?: number;
    alt?: number;
    is_verified: boolean;
  };
  images: File[];
}
```

---

## Database Schema

**Table:** `auras`

```sql
CREATE TABLE auras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title text,
  image_urls text[],                     -- Array of image URLs
  archetype_tag text,
  heading float,
  altitude float,
  location geography(POINT, 4326),       -- PostGIS point (lng, lat)
  is_verified boolean DEFAULT true,
  description text
);
```

**Function:** `insert_aura()`

```sql
CREATE FUNCTION insert_aura(
  p_user_id uuid,
  p_title text,
  p_image_urls text[],
  p_archetype_tag text,
  p_heading float,
  p_altitude float,
  p_lng float,
  p_lat float,
  p_is_verified boolean,
  p_description text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER;  -- Bypasses RLS
```

---

## Storage Buckets

**Bucket:** `aura-images`
- **Visibility:** Public (images are publicly accessible)
- **Path Structure:** `{user_id}/{timestamp}-{random}.webp`
- **RLS:** Disabled for development

---

## Error Handling

### Common Error Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| `400` | Bad Request | Missing/invalid data, validation failed |
| `401` | Unauthorized | Missing/invalid JWT token |
| `403` | Forbidden | RLS policy violation |
| `409` | Conflict | Email already exists (register) |
| `500` | Server Error | Database error, storage error, unexpected failures |

### Debugging RLS Errors

If you see `new row violates row-level security policy`:

1. **Check if error is from Storage or Database:**
   - Storage: Error in upload step, check `storage.objects` RLS
   - Database: Error in insert step, check `auras` table RLS

2. **For Development:**
   - Disable RLS on both Storage and Database
   - See `RLS_FIX.md` for complete fix

3. **Check backend logs:**
   - Look for `StorageApiError` = Storage RLS issue
   - Look for `RPC Error` = Database RLS issue

---

## Development Notes

### CORS Configuration
- **Development:** Allows all origins
- **Production:** Restricted to frontend URL

### Environment Variables
```env
PORT=8080
SUPABASE_URL=https://whsfuaidysfcpduohlyw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
CORS_ORIGIN=https://aura-frontend-255644230597.us-central1.run.app
```

### Testing with cURL

**Register:**
```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Upload (requires token):**
```bash
curl -X POST http://localhost:8080/api/auras/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg" \
  -F 'metadata={"title":"Test","archetype_tag":"The Spot","lat":37.77,"lng":-122.41,"is_verified":false}'
```

---

## Roadmap / TODO

### High Priority
- [ ] GET /api/auras - Fetch all auras
- [ ] GET /api/auras/:id - Fetch single aura
- [ ] GET /api/auras/nearby - Spatial query (PostGIS)
- [ ] GET /api/auras/bbox - Bounding box query

### Medium Priority
- [ ] POST /api/auras/:id/save - Save aura
- [ ] DELETE /api/auras/:id/save - Unsave aura
- [ ] POST /api/auras/:id/verify - Verify aura
- [ ] Input validation with Zod

### Low Priority
- [ ] Pagination
- [ ] Rate limiting
- [ ] Image optimization/compression
- [ ] Unit tests

---

## Support

For issues or questions:
- Check `RLS_FIX.md` for RLS troubleshooting
- Check `CLAUDE.md` for development guide
- Backend logs available in terminal
