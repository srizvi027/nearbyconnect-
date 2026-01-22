import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // For now, let the client handle auth redirects
  // This middleware mainly handles route protection
  
  const protectedRoutes = ['/dashboard', '/profile-setup'];
  const authRoute = '/';
  
  const isProtectedRoute = protectedRoutes.some(route => 
    req.nextUrl.pathname.startsWith(route)
  );
  
  // Let client-side handle authentication checks for now
  // This is a simple route-based protection
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|auth).*)'],
};