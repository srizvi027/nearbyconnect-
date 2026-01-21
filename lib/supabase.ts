import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create a placeholder client for build time, real client for runtime
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
)

// Database types - Updated for interests field compatibility
export type UserProfile = {
  id: string
  username: string
  full_name: string
  bio?: string
  avatar_url?: string
  interests?: string[]
  is_available: boolean
  city?: string
  country?: string
  phone?: string
  address?: string
  theme?: string
  created_at: string
  updated_at: string
}

// Keep old Profile for backward compatibility
export type Profile = UserProfile

export type NearbyUser = {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
}

export type Connection = {
  id: string;
  user_id_1: string;
  user_id_2: string;
  profile: UserProfile;
  distance?: number;
  unread_count?: number;
}

export type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}