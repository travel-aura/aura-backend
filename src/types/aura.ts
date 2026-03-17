export interface AuraMetadata {
  title: string
  archetype_tag: string
  heading: number
  alt: number
  lng: number
  lat: number
  is_verified: boolean
}

export interface Aura {
  id: string
  created_at: string
  user_id: string
  title: string | null
  image_url: string | null
  archetype_tag: string | null
  heading: number | null
  altitude: number | null
  is_verified: boolean
}
