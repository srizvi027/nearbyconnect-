'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type UserProfile, type NearbyUser } from '@/lib/supabase';

type MapViewProps = {
  userLocation: { lat: number; lng: number };
  nearbyUsers: NearbyUser[];
  currentUser: UserProfile | null;
  onUserClick: (user: NearbyUser) => void;
  onCurrentUserClick: () => void;
};

export default function MapView({ userLocation, nearbyUsers, currentUser, onUserClick, onCurrentUserClick }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const currentUserMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current) {
      // Initialize map
      mapRef.current = L.map('map').setView([userLocation.lat, userLocation.lng], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current);

      // Add current user marker
      updateCurrentUserMarker();
    }
  }, []);

  // Update current user marker when avatar changes
  useEffect(() => {
    updateCurrentUserMarker();
  }, [currentUser?.avatar_url]);

  const updateCurrentUserMarker = () => {
    if (!mapRef.current) return;

    // Remove old marker if exists
    if (currentUserMarkerRef.current) {
      currentUserMarkerRef.current.remove();
    }

    const avatarContent = currentUser?.avatar_url
      ? `<img src="${currentUser.avatar_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
      : '';
    
    const initialFallback = `
      <div style="
        width: 100%;
        height: 100%;
        display: ${currentUser?.avatar_url ? 'none' : 'flex'};
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 20px;
      ">
        ${currentUser?.full_name?.charAt(0).toUpperCase() || '?'}
      </div>
    `;

    const currentUserIcon = L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="
          width: 50px;
          height: 50px;
          background: ${currentUser?.avatar_url ? 'transparent' : 'linear-gradient(135deg, #093FB4, #0652e8)'};
          border: 4px solid white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
          cursor: pointer;
        ">
          ${avatarContent}
          ${initialFallback}
        </div>
        <!-- Outer blinking green ring -->
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 60px;
          height: 60px;
          border: 3px solid #10b981;
          border-radius: 50%;
          animation: pulse-ring 2s ease-in-out infinite;
          pointer-events: none;
        "></div>
        <!-- Green dot indicator -->
        <div style="
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 16px;
          height: 16px;
          background: #10b981;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          animation: pulse-dot 2s ease-in-out infinite;
        "></div>
        <style>
          @keyframes pulse-ring {
            0% { 
              transform: translate(-50%, -50%) scale(1);
              opacity: 1;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.15);
              opacity: 0.5;
            }
            100% { 
              transform: translate(-50%, -50%) scale(1);
              opacity: 1;
            }
          }
          @keyframes pulse-dot {
            0%, 100% { 
              transform: scale(1);
              opacity: 1;
            }
            50% { 
              transform: scale(1.1);
              opacity: 0.8;
            }
          }
        </style>
      `,
      iconSize: [50, 50],
      iconAnchor: [25, 25]
    });

    const marker = L.marker([userLocation.lat, userLocation.lng], { icon: currentUserIcon })
      .addTo(mapRef.current)
      .bindPopup(`
        <div style="text-align: center;">
          <strong>${currentUser?.full_name || 'You'}</strong><br/>
          <small style="color: #10b981;">● Online</small><br/>
          <small style="color: #666;">Click to view profile</small>
        </div>
      `);

    marker.on('click', () => {
      onCurrentUserClick();
    });

    currentUserMarkerRef.current = marker;
  };

  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for nearby users
    nearbyUsers.forEach((user) => {
      // Validate coordinates before creating marker
      const lat = user.latitude || user.lat;
      const lng = user.longitude || user.lng;
      
      if (typeof lat !== 'number' || typeof lng !== 'number' || 
          isNaN(lat) || isNaN(lng) || 
          (lat === 0 && lng === 0)) {
        console.warn('Invalid coordinates for user, skipping marker:', user.username, { lat, lng });
        return;
      }
      
      const distance = (user.distance_meters || user.distance_km * 1000) / 1000;
      const isVeryClose = distance < 0.5;
      
      const avatarContent = user.avatar_url
        ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
        : '';
      
      const initialFallback = `
        <div style="
          width: 100%;
          height: 100%;
          display: ${user.avatar_url ? 'none' : 'flex'};
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 18px;
        ">
          ${user.full_name.charAt(0).toUpperCase()}
        </div>
      `;
      
      const userIcon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            width: 45px;
            height: 45px;
            background: linear-gradient(135deg, #093FB4, #0652e8);
            border: 3px solid ${isVeryClose ? '#FFD8D8' : 'white'};
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s;
            overflow: hidden;
            position: relative;
            ${isVeryClose ? 'animation: blink 1.5s ease-in-out infinite;' : ''}
          " 
          onmouseover="this.style.transform='scale(1.2)'"
          onmouseout="this.style.transform='scale(1)'"
          >
            ${avatarContent}
            ${initialFallback}
            <div style="
              position: absolute;
              bottom: -2px;
              right: -2px;
              width: 12px;
              height: 12px;
              background: #10b981;
              border: 2px solid white;
              border-radius: 50%;
            "></div>
          </div>
          <style>
            @keyframes blink {
              0%, 100% { 
                box-shadow: 0 0 0 0 rgba(255, 216, 216, 0.7);
                border-color: #FFD8D8;
              }
              50% { 
                box-shadow: 0 0 0 10px rgba(255, 216, 216, 0);
                border-color: #ED3500;
              }
            }
          </style>
        `,
        iconSize: [45, 45],
        iconAnchor: [22.5, 22.5]
      });

      const marker = L.marker([lat, lng], { icon: userIcon })
        .addTo(mapRef.current!)
        .bindPopup(`
          <div style="text-align: center;">
            <strong>${user.full_name}</strong><br/>
            <small>@${user.username}</small><br/>
            <small style="color: #10b981;">● Online</small><br/>
            <small style="color: #093FB4;">${distance.toFixed(2)} km away</small>
          </div>
        `);

      marker.on('click', () => {
        onUserClick(user);
      });

      markersRef.current.push(marker);
    });
  }, [nearbyUsers]);

  return <div id="map" style={{ width: '100%', height: '100%' }} />;
}