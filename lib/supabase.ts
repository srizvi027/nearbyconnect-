import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables!')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export type Profile = {
  id: string
  username: string
  full_name: string
  bio?: string
  avatar_url?: string
  interests?: string[]
  is_available: boolean
  created_at: string
  updated_at: string
}