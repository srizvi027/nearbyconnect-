'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, type Profile, type NearbyUser, type Connection } from '@/lib/supabase';
import dynamic from 'next/dynamic';

// Dynamically import map component (client-side only)
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
const ChatWindow = dynamic(() => import('@/components/ChatWindow'), { ssr: false });

type User = {
  id: string;
  email?: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [showChatWindow, setShowChatWindow] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [showFullChat, setShowFullChat] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [showMyProfile, setShowMyProfile] = useState(false);

  useEffect(() => {
    checkUser();
    startLocationTracking();
  }, []);

  useEffect(() => {
    if (userLocation) {
      fetchNearbyUsers();
      const interval = setInterval(fetchNearbyUsers, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [userLocation]);

  useEffect(() => {
    if (user) {
      fetchConnections();
      subscribeToConnectionRequests();
    }
  }, [user]);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/');
        return;
      }

      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        if (!profileData.bio) {
          router.push('/profile-setup');
        }
      }
    } catch (error: unknown) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const startLocationTracking = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          
          // Update location in database
          await supabase.from('user_locations').upsert({
            user_id: (await supabase.auth.getUser()).data.user?.id,
            location: `POINT(${longitude} ${latitude})`,
            accuracy: position.coords.accuracy,
            updated_at: new Date().toISOString()
          });
        },
        (error: unknown) => console.error('Location error:', error),
        { enableHighAccuracy: true }
      );

      // Update location every 60 seconds
      setInterval(() => {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          
          await supabase.from('user_locations').upsert({
            user_id: (await supabase.auth.getUser()).data.user?.id,
            location: `POINT(${longitude} ${latitude})`,
            accuracy: position.coords.accuracy,
            updated_at: new Date().toISOString()
          });
        });
      }, 60000);
    }
  };

  const fetchNearbyUsers = async () => {
    if (!userLocation) return;

    try {
      const { data, error } = await supabase.rpc('find_nearby_users', {
        user_lat: userLocation.lat,
        user_lng: userLocation.lng,
        radius_km: 2
      });

      if (error) {
        console.error('Error fetching nearby users:', error);
        setNearbyUsers([]);
        setNearbyCount(0);
        return;
      }

      const users = data || [];
      setNearbyUsers(users);
      setNearbyCount(users.length);
    } catch (error: unknown) {
      console.error('Error fetching nearby users:', error);
      setNearbyUsers([]);
      setNearbyCount(0);
    }
  };

  const fetchConnections = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('connections')
        .select(`
          id,
          user_id_1,
          user_id_2,
          connected_at
        `)
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

      if (error) throw error;

      // Fetch profile details for each connection
      const connectionsWithProfiles = await Promise.all(
        (data || []).map(async (conn) => {
          const otherUserId = conn.user_id_1 === user.id ? conn.user_id_2 : conn.user_id_1;
          
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .single();

          // Get unread message count
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('connection_id', conn.id)
            .eq('is_read', false)
            .neq('sender_id', user.id);

          return {
            ...conn,
            profile: profileData,
            unread_count: count || 0
          };
        })
      );

      setConnections(connectionsWithProfiles);
    } catch (error: unknown) {
      console.error('Error fetching connections:', error);
    }
  };

  const subscribeToConnectionRequests = () => {
    const channel = supabase
      .channel('connection_requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `receiver_id=eq.${user?.id}`
        },
        () => {
          fetchConnections();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error: unknown) {
      console.error('Error logging out:', error);
    }
  };

  const handleUserClick = (nearbyUser: NearbyUser) => {
    setSelectedUser(nearbyUser);
  };

  const handleSendConnectionRequest = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('connection_requests')
        .insert({
          sender_id: user?.id,
          receiver_id: userId,
          status: 'pending'
        });

      if (error) throw error;
      
      alert('Connection request sent!');
      setSelectedUser(null);
    } catch (error: any) {
      if (error.code === '23505') {
        alert('Connection request already sent!');
      } else {
        console.error('Error sending request:', error);
      }
    }
  };

  const openChat = (connection: Connection) => {
    setSelectedConnection(connection);
    setShowChatWindow(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFCFB] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#093FB4] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#FFFCFB]">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">NearbyConnect</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/profile-setup')}
              className="text-gray-600 hover:text-[#093FB4]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-[#ED3500] hover:bg-red-600 text-white rounded-lg transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Welcome & Map */}
        <div className="flex-1 flex flex-col">
          {/* Welcome Card */}
          <div className="bg-white m-4 rounded-xl shadow-md p-4 flex items-center gap-4 flex-shrink-0">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 border-2 border-[#093FB4]"
                onError={(e) => {
                  // Fallback if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`w-16 h-16 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 ${profile?.avatar_url ? 'hidden' : ''}`}>
              {profile?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-800">
                Welcome back, {profile?.full_name?.split(' ')[0]}!
              </h2>
              <p className="text-sm text-gray-600">
                {profile?.is_available 
                  ? "You're currently visible" 
                  : "You're invisible"}
              </p>
              <button
                onClick={() => router.push('/profile-setup')}
                className="text-[#093FB4] hover:text-[#ED3500] text-sm font-medium mt-1 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Profile
              </button>
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 m-4 mt-0 rounded-xl overflow-hidden shadow-lg relative">
            {userLocation && (
              <MapView
                userLocation={userLocation}
                nearbyUsers={nearbyUsers}
                currentUser={profile}
                onUserClick={handleUserClick}
                onCurrentUserClick={() => setShowMyProfile(true)}
              />
            )}
            
            {/* Nearby counter */}
            <div className="absolute bottom-4 left-4 bg-[#ED3500] text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-[1000]">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
              </svg>
              <span className="font-bold">People nearby: {nearbyCount}</span>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Connections & Chats */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-bold text-gray-800 mb-3">My Connections</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {connections.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No connections yet
                </p>
              ) : (
                connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                  >
                    {conn.profile?.avatar_url ? (
                      <img
                        src={conn.profile.avatar_url}
                        alt={conn.profile.full_name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-[#093FB4]"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${conn.profile?.avatar_url ? 'hidden' : ''}`}>
                      {conn.profile?.full_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate">
                        {conn.profile?.full_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {conn.distance ? `${(conn.distance / 1000).toFixed(1)} km away` : 'Connected'}
                      </p>
                    </div>
                    <button
                      onClick={() => openChat(conn)}
                      className="px-3 py-1 bg-[#093FB4] hover:bg-[#0652e8] text-white rounded-full text-xs font-medium flex-shrink-0"
                    >
                      Chat
                    </button>
                    {conn.unread_count! > 0 && (
                      <span className="bg-[#ED3500] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {conn.unread_count}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => setShowFullChat(true)}
              className="w-full mt-3 px-4 py-2 bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white rounded-lg text-sm font-medium"
            >
              View all connections
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="font-bold text-gray-800 mb-3">Recent Chats</h3>
            <p className="text-sm text-gray-500 text-center py-4">
              No recent chats
            </p>
          </div>
        </div>
      </div>

      {/* My Profile Modal */}
      {showMyProfile && profile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
            <div className="text-center">
              <div className="relative inline-block mb-4">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-[#093FB4]"
                  />
                ) : (
                  <div className="w-24 h-24 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto">
                    {profile.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Online indicator */}
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-4 border-white rounded-full"></div>
              </div>
              
              <div className="flex items-center justify-center gap-2 mb-1">
                <h3 className="text-2xl font-bold text-gray-800">
                  {profile.full_name}
                </h3>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                  Online
                </span>
              </div>
              
              <p className="text-gray-600 mb-4">@{profile.username}</p>
              
              {profile.bio && (
                <div className="bg-[#FFD8D8]/30 rounded-lg p-4 mb-4 text-left">
                  <p className="text-sm text-gray-700">{profile.bio}</p>
                </div>
              )}

              {profile.interests && profile.interests.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Interests</h4>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {profile.interests.map((interest, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-[#093FB4] text-white text-xs rounded-full"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                {profile.city && (
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-gray-500">City</p>
                    <p className="font-semibold text-gray-800">{profile.city}</p>
                  </div>
                )}
                {profile.country && (
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <p className="text-gray-500">Country</p>
                    <p className="font-semibold text-gray-800">{profile.country}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowMyProfile(false)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowMyProfile(false);
                    router.push('/profile-setup');
                  }}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white rounded-xl font-semibold transition-all transform hover:scale-105"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
            <div className="text-center">
              {selectedUser.avatar_url ? (
                <img
                  src={selectedUser.avatar_url}
                  alt={selectedUser.full_name}
                  className="w-24 h-24 rounded-full object-cover mx-auto mb-4 border-4 border-[#093FB4]"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-24 h-24 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 ${selectedUser.avatar_url ? 'hidden' : ''}`}>
                {selectedUser.full_name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-1">
                {selectedUser.full_name}
              </h3>
              <p className="text-gray-600 mb-2">@{selectedUser.username}</p>
              <p className="text-sm text-[#ED3500] font-medium mb-4">
                📍 {(selectedUser.distance_meters / 1000).toFixed(2)} km away
              </p>
              
              {selectedUser.bio && (
                <div className="bg-[#FFD8D8]/30 rounded-lg p-4 mb-6 text-left">
                  <p className="text-sm text-gray-700">{selectedUser.bio}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => handleSendConnectionRequest(selectedUser.user_id)}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white rounded-xl font-semibold transition-all transform hover:scale-105"
                >
                  Connect Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Window */}
      {showChatWindow && selectedConnection && (
        <ChatWindow
          connection={selectedConnection}
          currentUserId={user?.id || ''}
          onClose={() => setShowChatWindow(false)}
        />
      )}
    </div>
  );
}