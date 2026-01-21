import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey
  });
}

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  id: string; // Updated to match DB function
  username: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  interests?: string[];
  distance_km: number; // Updated to match DB function
  last_seen: string;
  // Support both coordinate formats
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  distance_meters?: number; // For backward compatibility
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