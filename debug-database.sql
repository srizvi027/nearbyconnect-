-- Debug script to check database state and fix nearby users function

-- 1. Check if PostGIS extension is enabled
SELECT name, default_version, installed_version 
FROM pg_available_extensions 
WHERE name = 'postgis';

-- 2. Check current user profiles
SELECT id, username, full_name, is_available, created_at
FROM profiles
ORDER BY created_at DESC;

-- 3. Check user locations
SELECT ul.user_id, p.username, ul.location, ul.updated_at,
       ST_X(ul.location::geometry) as longitude,
       ST_Y(ul.location::geometry) as latitude
FROM user_locations ul
LEFT JOIN profiles p ON ul.user_id = p.id
ORDER BY ul.updated_at DESC;

-- 4. Check if the find_nearby_users function exists
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'find_nearby_users';

-- 5. Recreate the find_nearby_users function with better error handling
CREATE OR REPLACE FUNCTION find_nearby_users(user_lat double precision, user_lng double precision, radius_km double precision)
RETURNS TABLE (
    id uuid,
    username text,
    full_name text,
    avatar_url text,
    bio text,
    interests text[],
    distance_km double precision,
    last_seen timestamp with time zone
) 
LANGUAGE plpgsql
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
        ST_Distance(
            ST_MakePoint(user_lng, user_lat)::geography,
            ul.location::geography
        ) / 1000.0 as distance_km,
        ul.updated_at as last_seen
    FROM profiles p
    INNER JOIN user_locations ul ON p.id = ul.user_id
    WHERE p.is_available = true
    AND ST_DWithin(
        ST_MakePoint(user_lng, user_lat)::geography,
        ul.location::geography,
        radius_km * 1000
    )
    ORDER BY distance_km ASC;
END;
$$;

-- 6. Test the function with a sample location (adjust coordinates as needed)
-- Replace these coordinates with actual test coordinates
-- SELECT * FROM find_nearby_users(40.7128, -74.0060, 10);

-- 7. Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename IN ('profiles', 'user_locations');

-- 8. Sample insert for testing (uncomment and adjust as needed)
-- INSERT INTO user_locations (user_id, location) 
-- VALUES (
--     (SELECT id FROM profiles LIMIT 1),
--     ST_MakePoint(-74.0060, 40.7128)
-- )
-- ON CONFLICT (user_id) DO UPDATE SET 
--     location = EXCLUDED.location,
--     updated_at = NOW();