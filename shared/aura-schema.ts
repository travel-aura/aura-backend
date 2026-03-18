/**
 * SOURCE OF TRUTH: AURA DATA CONTRACT
 * Updated: 2026-03-18
 */

export type Archetype = 'The Angle' | 'The Path' | 'The Spot' | 'The Interior';

// 1. Complete database object
export interface Aura {
  id: string;             // uuid
  user_id: string;        // uuid (snake_case)
  title: string;
  description: string;
  image_urls: string[];   // text[] - carousel (snake_case)
  archetype_tag: string;  // snake_case
  heading: number;
  altitude: number;
  is_verified: boolean;   // snake_case
  created_at: string;     // ISO date (snake_case)
  lat: number;
  lng: number;
}

// 2. For profile/feed display
export interface Post {
  id: string;
  title: string;
  description: string;
  image_urls: string[];        // snake_case
  archetype_tag: string;       // snake_case
  altitude: number;
  lat: number;
  lng: number;
  created_at: string;          // snake_case
  is_verified: boolean;
}

// 3. What frontend sends in upload metadata
export interface AuraUploadMetadata {
  title: string;
  description?: string;
  archetype_tag: Archetype;
  lat?: number;                // Optional - only if GPS found
  lng?: number;                // Optional - only if GPS found
  heading?: number;            // Optional - only if GPS found
  altitude?: number;           // Optional - only if GPS found (formerly alt)
  is_verified: boolean;        // true if GPS, false if no GPS
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
    angle: number;
    path: number;
    spot: number;
    interior: number;
  };
}

// 5. Backend RPC parameters
export interface InsertAuraParams {
  p_user_id: string;
  p_title: string;
  p_image_urls: string[];
  p_archetype_tag: Archetype;
  p_description?: string | null;
  p_lat?: number | null;
  p_lng?: number | null;
  p_altitude?: number;
  p_heading?: number;
  p_is_verified: boolean;
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
  angle: number;
  path: number;
  spot: number;
  interior: number;
}
