'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ProfileSetup() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');
  
  // Profile fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  
  // Avatar upload
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  
  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'settings'>('profile');

  const interestSuggestions = [
    '🎮 Gaming', '📚 Reading', '🎵 Music', '🎨 Art', '⚽ Sports',
    '🍕 Foodie', '✈️ Travel', '📷 Photography', '🎬 Movies', '💻 Tech',
    '🏃 Fitness', '🧘 Yoga', '🎭 Theater', '🎸 Guitar', '☕ Coffee'
  ];

  useEffect(() => {
    checkUserAndLoadProfile();
    
    // Mark that user has visited profile setup
    sessionStorage.setItem('visited_profile_setup', 'true');
  }, []);

  const checkUserAndLoadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/');
        return;
      }

      setUserId(user.id);

      // Load existing profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (profileData) {
        setFullName(profileData.full_name || '');
        setUsername(profileData.username || '');
        setBio(profileData.bio || '');
        setPhone(profileData.phone || '');
        setDateOfBirth(profileData.date_of_birth || '');
        setAddress(profileData.address || '');
        setCity(profileData.city || '');
        setCountry(profileData.country || '');
        setInterests(profileData.interests || []);
        setIsAvailable(profileData.is_available ?? true);
        setTheme(profileData.theme || 'system');
        setAvatarUrl(profileData.avatar_url || '');
      }
    } catch (error: unknown) {
      console.error('Error:', error);
      setError('Failed to load profile');
    } finally {
      setInitialLoading(false);
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setError('');

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/${Math.random()}.${fileExt}`;

      // Upload image
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      setSuccess('Avatar uploaded successfully!');
    } catch (error: unknown) {
      console.error('Error uploading avatar:', error);
      setError('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const addInterest = (interest: string) => {
    if (!interests.includes(interest) && interests.length < 10) {
      setInterests([...interests, interest]);
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const handleAddCustomInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim()) && interests.length < 10) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError('Please fill in all password fields');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setSuccess('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    } catch (error: unknown) {
      setError('Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    // Basic validation
    if (!fullName.trim() || !username.trim()) {
      setError('Full name and username are required');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: fullName.trim(),
          username: username.toLowerCase().trim(),
          bio: bio.trim(),
          phone: phone.trim(),
          date_of_birth: dateOfBirth || null,
          address: address.trim(),
          city: city.trim(),
          country: country.trim(),
          interests: interests,
          is_available: isAvailable,
          theme: theme,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (updateError) throw updateError;

      setSuccess('Profile updated successfully! Redirecting...');
      
      // Use window.location for guaranteed redirect
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    } catch (err: unknown) {
      setError('Failed to update profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
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
    <div className="min-h-screen bg-gradient-to-br from-[#FFFCFB] to-[#FFD8D8] py-6 sm:py-12 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Complete Your Profile</h1>
          <p className="text-gray-600 text-sm sm:text-base">Tell others about yourself</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              activeTab === 'profile'
                ? 'bg-white shadow-md text-[#093FB4]'
                : 'bg-white/50 text-gray-600 hover:bg-white/70'
            }`}
          >
            👤 Profile Information
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              activeTab === 'settings'
                ? 'bg-white shadow-md text-[#093FB4]'
                : 'bg-white/50 text-gray-600 hover:bg-white/70'
            }`}
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
          {activeTab === 'profile' ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Avatar Upload */}
              <div className="text-center">
                <div className="relative inline-block">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-[#093FB4]"
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-[#093FB4] to-[#0652e8] rounded-full flex items-center justify-center text-white text-2xl sm:text-4xl font-bold">
                      {fullName.charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                  <label className="absolute bottom-0 right-0 bg-[#ED3500] text-white p-2 rounded-full cursor-pointer hover:bg-red-600 transition-colors">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={uploadAvatar}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mt-2">
                  {uploading ? 'Uploading...' : 'Click to upload profile picture'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors text-sm sm:text-base"
                    placeholder="John Doe"
                    disabled={loading}
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors text-sm sm:text-base"
                    placeholder="johndoe"
                    disabled={loading}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors text-sm sm:text-base"
                    placeholder="+1 234 567 8900"
                    disabled={loading}
                  />
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors text-sm sm:text-base"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  About You
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell people about yourself, your hobbies, what you're looking for..."
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors resize-none text-sm sm:text-base"
                  rows={3}
                  maxLength={500}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">{bio.length}/500 characters</p>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors text-sm sm:text-base"
                  placeholder="123 Main Street, Apt 4B"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* City */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors text-sm sm:text-base"
                    placeholder="Karachi"
                    disabled={loading}
                  />
                </div>

                {/* Country */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-200 rounded-xl focus:border-[#093FB4] focus:outline-none transition-colors text-sm sm:text-base"
                    placeholder="Pakistan"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Interests */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Interests (Max 10)
                </label>
                
                {interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
                    {interests.map((interest, index) => (
                      <span
                        key={index}
                        className="bg-[#093FB4] text-white px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2"
                      >
                        {interest}
                        <button
                          onClick={() => removeInterest(interest)}
                          className="hover:bg-white/20 rounded-full p-0.5"
                          disabled={loading}
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
                  {interestSuggestions
                    .filter(s => !interests.includes(s))
                    .slice(0, 8)
                    .map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => addInterest(suggestion)}
                        className="bg-gray-100 hover:bg-[#FFD8D8] text-gray-700 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm transition-colors"
                        disabled={loading || interests.length >= 10}
                      >
                        {suggestion}
                      </button>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomInterest()}
                    placeholder="Add custom interest..."
                    className="flex-1 px-3 sm:px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#093FB4] focus:outline-none transition-colors text-xs sm:text-sm"
                    disabled={loading || interests.length >= 10}
                    maxLength={30}
                  />
                  <button
                    onClick={handleAddCustomInterest}
                    className="px-3 sm:px-4 py-2 bg-[#093FB4] hover:bg-[#0652e8] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm whitespace-nowrap"
                    disabled={loading || !newInterest.trim() || interests.length >= 10}
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">{interests.length}/10 interests added</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Visibility Toggle */}
              <div className="bg-[#FFD8D8]/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-800">Profile Visibility</h3>
                    <p className="text-sm text-gray-600">
                      {isAvailable 
                        ? "You're visible to nearby users" 
                        : "You're invisible to others"}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAvailable(!isAvailable)}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                      isAvailable ? 'bg-[#093FB4]' : 'bg-gray-300'
                    }`}
                    disabled={loading}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        isAvailable ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Theme Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Theme Preference
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((themeOption) => (
                    <button
                      key={themeOption}
                      onClick={() => setTheme(themeOption)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        theme === themeOption
                          ? 'border-[#093FB4] bg-[#093FB4]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      disabled={loading}
                    >
                      <div className="text-2xl mb-2">
                        {themeOption === 'light' && '☀️'}
                        {themeOption === 'dark' && '🌙'}
                        {themeOption === 'system' && '💻'}
                      </div>
                      <div className="text-sm font-medium text-gray-800 capitalize">
                        {themeOption}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Change Password */}
              <div className="bg-gray-50 rounded-xl p-4">
                <button
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <h3 className="font-medium text-gray-800">Change Password</h3>
                    <p className="text-sm text-gray-600">Update your account password</p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-600 transition-transform ${
                      showPasswordChange ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showPasswordChange && (
                  <div className="mt-4 space-y-3">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 characters)"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#093FB4] focus:outline-none transition-colors"
                      disabled={loading}
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-[#093FB4] focus:outline-none transition-colors"
                      disabled={loading}
                    />
                    <button
                      onClick={handleChangePassword}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-[#ED3500] hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 bg-[#FFD8D8] border border-[#ED3500] rounded-lg text-xs sm:text-sm text-[#ED3500]">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-500 rounded-lg text-xs sm:text-sm text-green-700">
              {success}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-6">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 px-4 py-3 sm:px-6 sm:py-3 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors text-sm sm:text-base order-2 sm:order-1"
              disabled={loading}
            >
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-3 sm:px-6 sm:py-3 bg-gradient-to-r from-[#093FB4] to-[#0652e8] hover:from-[#0652e8] hover:to-[#093FB4] text-white rounded-xl font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm sm:text-base order-1 sm:order-2"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save Profile'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}