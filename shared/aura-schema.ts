/**
 * SOURCE OF TRUTH: AURA DATA CONTRACT
 * Last verified against DB: 2026-07-03
 */

export type Archetype = 'Photo Spots' | 'Wanderings' | 'Indoor Vibes';

// 1. Complete database object
export interface Aura {
  id: string;
  user_id: string;
  user_name?: string;              // flat field joined from users table (present on some endpoints)
  user_avatar_url?: string | null; // flat field joined from users table (present on some endpoints)
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
  parent_id: string | null;
  distance_meters: number | null;   // null on global feed, metres from search point on spatial search
  perspective_count: number;        // count of child perspectives (0 for perspectives themselves)
  like_count: number;
  is_liked: boolean;
  tags: string[];
  // Extended EXIF metadata (present when backend stores them)
  taken_at?: string | null;        // EXIF DateTimeOriginal ISO string
  tz_offset?: string | null;       // e.g. "+08:00" from OffsetTimeOriginal
  gps_accuracy?: number | null;    // metres from GPSHPositioningError or GPSDOP
  gps_timestamp?: string | null;   // UTC ISO from GPS clock
}

// 2. For profile/feed display
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
  like_count?: number;
  is_liked?: boolean;
  tags?: string[];
}

// 3. What frontend sends in upload metadata
export interface AuraUploadMetadata {
  title: string;
  description?: string;
  archetype_tag?: Archetype;
  lat?: number;                // Optional - only if GPS found
  lng?: number;                // Optional - only if GPS found
  heading?: number;            // Optional - only if GPS found
  altitude?: number;           // Optional - only if GPS found (formerly alt)
  is_verified: boolean;        // true if GPS, false if no GPS
  parent_id?: string | null;   // null = Anchor, uuid = Perspective
  tags?: string[];             // Up to 5 user-selected tags
  // Extended EXIF metadata
  taken_at?: string;           // naive local ISO: EXIF DateTimeOriginal (when photo was taken)
  tz_offset?: string;          // e.g. "+08:00" from OffsetTimeOriginal
  gps_accuracy?: number;       // metres: GPSHPositioningError or GPSDOP
  gps_timestamp?: string;      // UTC ISO from GPS clock (GPSDateStamp + GPSTimeStamp)
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

// 5. Backend RPC parameters (what backend needs to accept + store)
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
  p_parent_id?: string | null;
  // Extended EXIF — new columns needed in DB
  p_taken_at?: string;        // naive local ISO "YYYY-MM-DDTHH:MM:SS" (no TZ suffix)
  p_tz_offset?: string;       // e.g. "+08:00"
  p_gps_accuracy?: number;    // metres (GPSHPositioningError or GPSDOP)
  p_gps_timestamp?: string;   // UTC ISO "YYYY-MM-DDTHH:MM:SSZ" from GPS chip
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
  friend_count?: number;  // mutual follows; when present, shown as "Friends" stat
  top_tags: string[];
  cities: string[];
}

// 8. User profile
export interface UserProfile {
  user_id: string;
  email: string;
  name: string;             // Max 10 chars, defaults to email prefix
  bio: string | null;       // Max 100 chars
  avatar_url: string | null;
}

// 9. Profile update payload (all fields optional)
export interface ProfileUpdatePayload {
  name?: string;            // Max 10 chars
  bio?: string;             // Max 100 chars
}

// 10. A perspective shown inside the detail view
export interface Perspective {
  id: string;
  image_urls: string[];
  archetype_tag: string;
  created_at: string;
  user_name: string;
  user_avatar_url: string | null;
}

// 11. Single aura with user info (for GET /api/auras/:id)
export interface AuraWithUser extends Aura {
  is_saved: boolean;
  perspectives: Perspective[];
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
  is_following: boolean;      // does the recipient already follow back?
  aura_id?: string | null;    // set on save/perspective notifications
  aura_title?: string | null; // set on save/perspective notifications
}

// 15. Public user profile (shown to others — no saved posts)
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
