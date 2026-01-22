'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type LoadingScreenProps = {
  show: boolean;
  message?: string;
};

export default function LoadingScreen({ show, message = 'Loading...' }: LoadingScreenProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#093FB4] to-[#0652e8] flex items-center justify-center">
      {/* Background animations */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-[#FFD8D8] rounded-full opacity-20 animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#ED3500] rounded-full opacity-10 animate-pulse" style={{ animationDelay: '1s' }}></div>
      
      <div className="text-center relative z-10">
        <div className="relative mb-8">
          {/* Logo container with spinning border */}
          <div className="w-32 h-32 mx-auto relative">
            <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            <div className="w-full h-full bg-white rounded-full flex items-center justify-center p-6 shadow-2xl">
              <img 
                src="/nearby-connect.png" 
                alt="NearbyConnect Logo" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          {/* Multiple pulsing rings for better visibility */}
          <div className="absolute inset-0 border-2 border-white/50 rounded-full animate-ping"></div>
          <div className="absolute inset-2 border-2 border-[#FFD8D8]/60 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
        </div>
        <h2 className="text-3xl font-bold text-white mb-3 drop-shadow-lg">NearbyConnect</h2>
        <p className="text-[#FFD8D8] text-lg font-medium animate-pulse mb-6">{message}</p>
        
        {/* Enhanced loading dots */}
        <div className="flex justify-center items-center space-x-3">
          <div className="w-3 h-3 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-3 h-3 bg-[#FFD8D8] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
        </div>
      </div>
    </div>
  );
}

// Hook for navigation loading
export function useNavigationLoading() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('Loading...');

  const showLoading = (loadingMessage?: string) => {
    setMessage(loadingMessage || 'Loading...');
    setIsLoading(true);
  };

  const hideLoading = () => {
    setIsLoading(false);
  };

  return {
    isLoading,
    message,
    showLoading,
    hideLoading,
    LoadingScreen: () => <LoadingScreen show={isLoading} message={message} />
  };
}