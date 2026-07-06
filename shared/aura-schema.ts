/**
 * SOURCE OF TRUTH: AURA DATA CONTRACT
 * Last updated: 2026-07-06
 *
 * Place architecture (new):
 *   - Every GPS post belongs to a Place (place_id FK on auras table)
 *   - Venue  = named business (restaurant/café/store) — has venue_id (Mapbox POI feature ID)
 *   - Spot   = unnamed outdoor/generic location — no venue_id, matched by GPS proximity radius
 *   - Backend creates a new Place when none exists at the upload location
 *
 * Upload flow:
 *   1. "Is this at a restaurant/café/store?" → Mapbox POI search
 *      Yes → sends venue_id + place_name → backend find-or-creates Place by venue_id
 *      No  → Step 2
 *   2. GET /api/places/nearby → show nearby generic spots
 *      Pick spot → sends place_id (existing)
 *      "New spot" / nothing nearby → no place_id → backend auto-creates Place
 */

export type Archetype = 'Photo Spots' | 'Wanderings' | 'Indoor Vibes';

// ── Place ─────────────────────────────────────────────────────────────────────

export interface Place {
  id: string;                   // uuid PK
  name: string;                 // display name (from Mapbox POI or auto-generated)
  latitude: number;
  longitude: number;
  venue_id: string | null;      // Mapbox POI feature ID — set for named venues, null for generic spots
  cover_post_id: string | null; // FK → auras.id — first/featured post at this place
  verified_count: number;       // # GPS-verified posts at this place
}

// Nearby place entry returned by GET /api/places/nearby
export interface NearbyPlace {
  id: string;
  name: string;
  distance_meters: number;
  verified_count: number;
  cover_image_url: string | null;
}

// GET /api/places/:place_id response
export interface PlaceResponse {
  place: Place;
  posts: Aura[];                // other posts at this place (excluding the requested post)
}

// ── Aura (post) ───────────────────────────────────────────────────────────────

// 1. Complete database object
export interface Aura {
  id: string;
  user_id: string;
  user_name?: string;              // joined from users table (present on some endpoints)
  user_avatar_url?: string | null; // joined from users table (present on some endpoints)
  title: string;
  description: string;
  image_urls: string[];
  archetype_tag: string;
  heading: number;
  altitude: number;
  is_verified: boolean;
  created_at: string;
  lat: number;
  lng: number;
  place_id?: string | null;         // FK → places.id
  place_name?: string | null;       // denormalised venue display name
  parent_id: string | null;         // legacy — superseded by place_id
  distance_meters: number | null;   // null on global feed, metres on spatial search
  perspective_count: number;        // legacy count of child perspectives
  like_count: number;
  is_liked: boolean;
  tags: string[];
  // Extended EXIF metadata (stored when backend receives them)
  taken_at?: string | null;         // naive local ISO "YYYY-MM-DDTHH:MM:SS" (no Z)
  tz_offset?: string | null;        // e.g. "+08:00"
  gps_accuracy?: number | null;     // metres (GPSHPositioningError or GPSDOP)
  gps_timestamp?: string | null;    // UTC ISO from GPS chip
}

// 2. Lightweight post for profile/feed display
export interface Post {
  id: string;
  title: string;
  description: string;
  image_urls: string[];
  archetype_tag: string;
  altitude: number;
  lat: number;
  lng: number;
  created_at: string;
  is_verified: boolean;
  place_id?: string | null;
  place_name?: string | null;
  like_count?: number;
  is_liked?: boolean;
  tags?: string[];
}

// 3. What frontend sends as metadata JSON in upload FormData
export interface AuraUploadMetadata {
  title: string;
  description?: string;
  archetype_tag?: Archetype;
  // GPS — only present when EXIF has coordinates
  lat?: number;
  lng?: number;
  heading?: number;
  altitude?: number;
  is_verified: boolean;           // true if GPS found, false otherwise
  // Place linking (mutually exclusive paths — see upload flow above)
  venue_id?: string | null;       // Mapbox POI feature ID → backend find-or-creates Place by this
  place_name?: string;            // display name of the venue (sent alongside venue_id)
  place_id?: string | null;       // uuid of existing generic spot chosen by user
  // Legacy
  parent_id?: string | null;
  // Tags
  tags?: string[];
  // Extended EXIF
  taken_at?: string;              // naive local ISO (no Z suffix)
  tz_offset?: string;             // e.g. "+08:00"
  gps_accuracy?: number;
  gps_timestamp?: string;         // UTC ISO from GPS clock
}

// 4. Profile page response
export interface ProfileData {
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
    bio: string | null;
  };
  posts: Post[];
  stats: {
    photo_spots: number;
    wanderings: number;
    indoor_vibes: number;
  };
}

// 5. Backend RPC parameters
export interface InsertAuraParams {
  p_user_id: string;
  p_title: string;
  p_image_urls: string[];
  p_archetype_tag?: Archetype;
  p_description?: string | null;
  p_lat?: number | null;
  p_lng?: number | null;
  p_altitude?: number;
  p_heading?: number;
  p_is_verified: boolean;
  p_tags?: string[];
  // Place
  p_place_id?: string | null;     // link to existing Place
  p_venue_id?: string | null;     // Mapbox POI ID → find-or-create Place
  p_place_name?: string | null;   // venue display name
  // Legacy
  p_parent_id?: string | null;
  // Extended EXIF
  p_taken_at?: string;            // naive local ISO "YYYY-MM-DDTHH:MM:SS"
  p_tz_offset?: string;
  p_gps_accuracy?: number;
  p_gps_timestamp?: string;       // UTC ISO "YYYY-MM-DDTHH:MM:SSZ"
}

// 6. Feed response with pagination
export interface FeedResponse {
  ok: true;
  auras: Aura[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

// 7. Archetype stats response
export interface ArchetypeStats {
  photo_spots: number;
  wanderings: number;
  indoor_vibes: number;
  city_count: number;
  verified_count: number;
  follower_count: number;
  friend_count?: number;  // mutual follows; shown as "Friends" when present
  top_tags: string[];
  cities: string[];
}

// 8. Current user profile (GET /me)
export interface UserProfile {
  user_id: string;
  email: string;
  name: string;             // max 10 chars
  bio: string | null;       // max 100 chars
  avatar_url: string | null;
}

// 9. Profile update payload (PUT /api/profile/update)
export interface ProfileUpdatePayload {
  name?: string;
  bio?: string;
}

// 10. Legacy perspective (Anchor/Perspective system — superseded by Place posts)
export interface Perspective {
  id: string;
  image_urls: string[];
  archetype_tag: string;
  created_at: string;
  user_name: string;
  user_avatar_url: string | null;
}

// 11. Single aura with user info (GET /api/auras/:id)
export interface AuraWithUser extends Aura {
  is_saved: boolean;
  perspectives: Perspective[];  // legacy — "More shots" now comes from PlaceResponse.posts
  user?: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
}

// 12. Single aura response
export interface AuraResponse {
  ok: true;
  aura: AuraWithUser;
}

// 13. Saved auras response
export interface SavedAurasResponse {
  ok: true;
  auras: (Aura & { saved_at: string })[];
}

// 14. Notification
export interface Notification {
  id: string;
  type: 'follow' | 'save' | 'perspective';
  read: boolean;
  created_at: string;
  actor_id: string;
  actor_name: string;
  actor_avatar: string | null;
  is_following: boolean;
  aura_id?: string | null;
  aura_title?: string | null;
}

// 15. Public user profile (GET /api/users/:id)
export interface PublicProfile {
  user_id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  post_count: number;
}

export interface PublicProfileResponse {
  ok: true;
  profile: PublicProfile;
  posts: Aura[];
  stats: ArchetypeStats;
}
