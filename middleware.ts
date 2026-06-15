import { NextRequest, NextResponse } from 'next/server';

const EXPERIMENT_SLUGS = new Set([
  'stroop', 'drm', 'bouba-kiki', 'mentalRep', 'summaryStats',
  'posnerCueing', 'visualSearch', 'CompositeFace', 'wordSuperiority',
  'srt', 'twoStepTask', 'serialOrder', 'testingEffect', 'logics',
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split('/').filter(Boolean);

  // Must start with a known experiment slug
  if (segments.length === 0 || !EXPERIMENT_SLUGS.has(segments[0])) {
    return NextResponse.next();
  }

  // Teacher pages are never blocked — teacher should always have access
  if (segments[segments.length - 1] === 'teacher') {
    return NextResponse.next();
  }

  // Admin bypass: set when the homepage password is entered correctly
  if (request.cookies.get('cognitives_admin')?.value === '1') {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.next();

  try {
    const slug = segments[0];
    const res  = await fetch(
      `${supabaseUrl}/rest/v1/experiment_locks?experiment_id=eq.${slug}&select=is_locked`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const data: { is_locked: boolean }[] = await res.json();
    if (data?.[0]?.is_locked === true) {
      return NextResponse.redirect(
        new URL(`/locked?experiment=${slug}`, request.url)
      );
    }
  } catch {
    // Fail open — if Supabase is unreachable, allow through
  }

  return NextResponse.next();
}

// Match landing page AND all sub-routes (/practice, /experiment, /thanks, etc.)
// Teacher pages are excluded inside the function above, not here.
export const config = {
  matcher: [
    '/stroop/:path*',          '/drm/:path*',
    '/bouba-kiki/:path*',      '/mentalRep/:path*',
    '/summaryStats/:path*',    '/posnerCueing/:path*',
    '/visualSearch/:path*',    '/CompositeFace/:path*',
    '/wordSuperiority/:path*', '/srt/:path*',
    '/twoStepTask/:path*',     '/serialOrder/:path*',
    '/testingEffect/:path*',
    '/logics/:path*',
  ],
};
