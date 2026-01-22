import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Create Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    try {
      // Exchange the code for a session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Auth callback error:', error);
        // Redirect to login with error
        return NextResponse.redirect(`${origin}/?error=auth_callback_error`);
      }

      if (data.user) {
        // Check if user profile exists, if not create it
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (!existingProfile) {
          // Create profile for new Google user
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              email: data.user.email,
              full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || 'User',
              username: data.user.user_metadata?.preferred_username || 
                       data.user.email?.split('@')[0] || 
                       `user_${data.user.id.slice(0, 8)}`,
              avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
              is_available: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (profileError) {
            console.error('Profile creation error:', profileError);
            // Continue to dashboard even if profile creation fails
          }
        }

        // Successful authentication - redirect to dashboard
        return NextResponse.redirect(`${origin}/dashboard`);
      }
    } catch (error) {
      console.error('Unexpected auth callback error:', error);
      return NextResponse.redirect(`${origin}/?error=unexpected_error`);
    }
  }

  // No code parameter or other error - redirect back to login
  return NextResponse.redirect(`${origin}/?error=missing_code`);
}