/**
 * SOURCE OF TRUTH: AURA DATA CONTRACT
 * Updated: 2026-07-02
 */

// 1. Complete database object
export interface Aura {
  id: string;
  user_id: string;
  title: string;
  description: string;
  image_urls: string[];
  heading: number;
  altitude: number;
  is_verified: boolean;
  created_at: string;
  lat: number;
  lng: number;
  parent_id: string | null;
  distance_meters: number | null;
  perspective_count: number;
  like_count: number;
  is_liked: boolean;
  tags: string[];
}

// 2. For profile/feed display
export interface Post {
  id: string;
  title: string;
  description: string;
  image_urls: string[];
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
  lat?: number;
  lng?: number;
  heading?: number;
  altitude?: number;
  is_verified: boolean;
  tags?: string[];
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
  stats: UserStats;
}

// 5. Backend RPC parameters
export interface InsertAuraParams {
  p_user_id: string;
  p_title: string;
  p_image_urls: string[];
  p_description?: string | null;
  p_lat?: number | null;
  p_lng?: number | null;
  p_altitude?: number;
  p_heading?: number;
  p_is_verified: boolean;
  p_tags?: string[] | null;
  p_city_name?: string | null;
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

// 7. User stats
export interface UserStats {
  city_count: number;
  verified_count: number;
  follower_count: number;
  top_tags: string[];
  cities: string[];
}

// 8. User profile
export interface UserProfile {
  user_id: string;
  email: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
}

// 9. Profile update payload
export interface ProfileUpdatePayload {
  name?: string;
  bio?: string;
}

// 10. A perspective shown inside the detail view
export interface Perspective {
  id: string;
  image_urls: string[];
  created_at: string;
  user_name: string;
  user_avatar_url: string | null;
}

// 11. Single aura with user info (for GET /api/auras/:id)
export interface AuraWithUser extends Aura {
  is_saved: boolean;
  perspectives: Perspective[];
  user: {
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
  type: 'follow' | 'like';
  read: boolean;
  created_at: string;
  actor_id: string;
  actor_name: string;
  actor_avatar: string | null;
  is_following: boolean;
}

// 15. Public user profile
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
  auras: Aura[];
  stats: UserStats;
}
