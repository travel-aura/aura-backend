/**
 * SOURCE OF TRUTH: AURA DATA CONTRACT
 * Updated: 2026-03-17
 */

export type Archetype = 'The Angle' | 'The Path' | 'The Spot' | 'The Interior';

export interface Aura {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  image_urls: string[]; // Handled as text[] in Postgres
  archetype_tag: Archetype;
  lat: number;          // Decoded from geography(POINT)
  lng: number;          // Decoded from geography(POINT)
  heading: number;
  altitude: number;
  is_verified: boolean;
  created_at: string;
}

// What the Frontend sends to the POST endpoint
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
  images: File[]; // Max 5
}
