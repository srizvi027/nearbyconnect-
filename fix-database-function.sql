-- ============================================
-- NEARBYCONNECT - COMPLETE DATABASE SETUP
-- ============================================
-- Copy this entire file and run it in Supabase SQL Editor
-- This will set up everything from scratch
-- ============================================

-- ============================================
-- STEP 1: EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 2: DROP EXISTING TABLES (Clean Start)
-- ============================================
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.connections CASCADE;
DROP TABLE IF EXISTS public.connection_requests CASCADE;
DROP TABLE IF EXISTS public.user_locations CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================
-- STEP 3: CREATE TABLES
-- ============================================

-- Profiles Table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  interests TEXT[] DEFAULT '{}',
  is_available BOOLEAN DEFAULT true,
  address TEXT,
  city TEXT,
  country TEXT,
  phone TEXT,
  date_of_birth DATE,
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Locations Table
CREATE TABLE public.user_locations (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  location GEOGRAPHY(POINT, 4326),
  accuracy DOUBLE PRECISION,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Connection Requests Table
CREATE TABLE public.connection_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

-- Connections Table
CREATE TABLE public.connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id_1 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_id_2 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (user_id_1 < user_id_2),
  UNIQUE(user_id_1, user_id_2)
);

-- Messages Table
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID REFERENCES public.connections(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STEP 4: CREATE INDEXES
-- ============================================
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_is_available ON public.profiles(is_available);
CREATE INDEX idx_user_locations_geography ON public.user_locations USING GIST(location);
CREATE INDEX idx_connection_requests_receiver ON public.connection_requests(receiver_id, status);
CREATE INDEX idx_connection_requests_sender ON public.connection_requests(sender_id, status);
CREATE INDEX idx_connections_user1 ON public.connections(user_id_1);
CREATE INDEX idx_connections_user2 ON public.connections(user_id_2);
CREATE INDEX idx_messages_connection ON public.messages(connection_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_unread ON public.messages(connection_id, is_read) WHERE is_read = false;

-- ============================================
-- STEP 5: ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 6: CREATE RLS POLICIES
-- ============================================

-- Profiles Policies
CREATE POLICY "profiles_select_policy"
  ON public.profiles FOR SELECT
  USING (is_available = true OR auth.uid() = id);

CREATE POLICY "profiles_insert_policy"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_policy"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- User Locations Policies
CREATE POLICY "user_locations_select_policy"
  ON public.user_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_locations_insert_policy"
  ON public.user_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_locations_update_policy"
  ON public.user_locations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_locations_delete_policy"
  ON public.user_locations FOR DELETE
  USING (auth.uid() = user_id);

-- Connection Requests Policies
CREATE POLICY "connection_requests_select_policy"
  ON public.connection_requests FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "connection_requests_insert_policy"
  ON public.connection_requests FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "connection_requests_update_policy"
  ON public.connection_requests FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Connections Policies
CREATE POLICY "connections_select_policy"
  ON public.connections FOR SELECT
  USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

CREATE POLICY "connections_insert_policy"
  ON public.connections FOR INSERT
  WITH CHECK (true);

-- Messages Policies
CREATE POLICY "messages_select_policy"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = messages.connection_id
      AND (c.user_id_1 = auth.uid() OR c.user_id_2 = auth.uid())
    )
  );

CREATE POLICY "messages_insert_policy"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = connection_id
      AND (c.user_id_1 = auth.uid() OR c.user_id_2 = auth.uid())
    )
  );

CREATE POLICY "messages_update_policy"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = messages.connection_id
      AND (c.user_id_1 = auth.uid() OR c.user_id_2 = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = messages.connection_id
      AND (c.user_id_1 = auth.uid() OR c.user_id_2 = auth.uid())
    )
  );

-- ============================================
-- STEP 7: CREATE FUNCTIONS
-- ============================================

-- Drop any existing versions of find_nearby_users to avoid conflicts
DROP FUNCTION IF EXISTS find_nearby_users(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS find_nearby_users(numeric, numeric, numeric);
DROP FUNCTION IF EXISTS find_nearby_users(user_lat double precision, user_lng double precision, radius_km double precision);
DROP FUNCTION IF EXISTS find_nearby_users(user_lat numeric, user_lng numeric, radius_km numeric);

-- Function: Find Nearby Users (FIXED VERSION)
CREATE OR REPLACE FUNCTION find_nearby_users(
    user_lat double precision, 
    user_lng double precision, 
    radius_km double precision DEFAULT 2
)
RETURNS TABLE (
    id uuid,
    username text,
    full_name text,
    avatar_url text,
    bio text,
    interests text[],
    latitude double precision,
    longitude double precision,
    distance_km double precision,
    last_seen timestamp with time zone
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.full_name,
        p.avatar_url,
        p.bio,
        p.interests,
        ST_Y(ul.location::geometry) as latitude,
        ST_X(ul.location::geometry) as longitude,
        ST_Distance(
            ST_MakePoint(user_lng, user_lat)::geography,
            ul.location::geography
        ) / 1000.0 as distance_km,
        ul.updated_at as last_seen
    FROM public.profiles p
    INNER JOIN public.user_locations ul ON p.id = ul.user_id
    WHERE p.is_available = true
    AND p.id != COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    AND ST_DWithin(
        ST_MakePoint(user_lng, user_lat)::geography,
        ul.location::geography,
        radius_km * 1000
    )
    ORDER BY distance_km ASC
    LIMIT 100;
END;
$$;

-- Function: Handle New User Creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, theme)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1),
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      SPLIT_PART(NEW.email, '@', 1),
      'User'
    ),
    'system'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Function: Create Connection on Accept
CREATE OR REPLACE FUNCTION create_connection_on_accept()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status = 'pending') THEN
    INSERT INTO public.connections (user_id_1, user_id_2)
    VALUES (
      LEAST(NEW.sender_id, NEW.receiver_id),
      GREATEST(NEW.sender_id, NEW.receiver_id)
    )
    ON CONFLICT (user_id_1, user_id_2) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Function: Handle Updated At
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================
-- STEP 8: CREATE TRIGGERS
-- ============================================

-- Trigger: Auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Create connection on accept
DROP TRIGGER IF EXISTS on_connection_request_accept ON public.connection_requests;
CREATE TRIGGER on_connection_request_accept
  AFTER UPDATE ON public.connection_requests
  FOR EACH ROW
  EXECUTE FUNCTION create_connection_on_accept();

-- Trigger: Update profiles.updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: Update connection_requests.updated_at
DROP TRIGGER IF EXISTS set_connection_requests_updated_at ON public.connection_requests;
CREATE TRIGGER set_connection_requests_updated_at
  BEFORE UPDATE ON public.connection_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- STEP 9: GRANT PERMISSIONS
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.connection_requests TO authenticated;

GRANT SELECT ON public.connections TO authenticated;
GRANT INSERT ON public.connections TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

-- Grant function execution
GRANT EXECUTE ON FUNCTION find_nearby_users(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next: Setup Storage Bucket Manually (see instructions below)
-- ============================================

-- Quick verification query
SELECT 
  'Tables Created' as status,
  COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'user_locations', 'connection_requests', 'connections', 'messages');

-- Check if function exists
SELECT 
  'Function Created' as status,
  COUNT(*) as function_count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
AND p.proname = 'find_nearby_users';