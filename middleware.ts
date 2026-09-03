import { NextRequest, NextResponse } from 'next/server';

const EXPERIMENT_SLUGS = new Set([
  'stroop', 'drm', 'bouba-kiki', 'mentalRep', 'summaryStats',
  'posnerCueing', 'visualSearch', 'CompositeFace', 'wordSuperiority',
  'srt', 'twoStepTask', 'serialOrder', 'testingEffect', 'logics',
  'creativity',
  'bRMS',
  'boubaKikiDemo',
  'flankerLetterTask',
  'lexicalDecisionPairs',
]);

// Lock state changes at most a few times per semester, but without caching we
// hit Supabase on every navigation to every experiment route. Cache each slug's
// lock flag in-process for a short TTL so a class moving through pages reuses the
// lookup instead of generating one REST call per page view.
const LOCK_TTL_MS = 30_000;
const lockCache = new Map<string, { isLocked: boolean; expires: number }>();

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split('/').filter(Boolean);

  // Definition-based experiments serve from /run/{slug}, so the slug is the second
  // segment there. Without this, locking silently does nothing for every generated
  // experiment — the lock toggle would appear to work and change nothing.
  const isRun = segments[0] === 'run';
  const rest = isRun ? segments.slice(1) : segments;

  // Must start with a known experiment slug
  if (rest.length === 0 || !EXPERIMENT_SLUGS.has(rest[0])) {
    return NextResponse.next();
  }

  // Teacher pages are never blocked — teacher should always have access
  if (rest[rest.length - 1] === 'teacher') {
    return NextResponse.next();
  }

  // Admin bypass: set when the homepage password is entered correctly
  if (request.cookies.get('cognitives_admin')?.value === '1') {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.next();

  const slug = rest[0];

  try {
    const cached = lockCache.get(slug);
    let isLocked: boolean;

    if (cached && cached.expires > Date.now()) {
      isLocked = cached.isLocked;
    } else {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/experiment_locks?experiment_id=eq.${slug}&select=is_locked`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      const data: { is_locked: boolean }[] = await res.json();
      isLocked = data?.[0]?.is_locked === true;
      lockCache.set(slug, { isLocked, expires: Date.now() + LOCK_TTL_MS });
    }

    if (isLocked) {
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
    '/creativity/:path*',
    '/bRMS/:path*',
    '/boubaKikiDemo/:path*',
    // Definition experiments live under /run/{slug}. Registering one as a bare
    // '/{slug}/:path*' matches a route that does not exist, so middleware never runs and
    // the lock toggle silently does nothing — which is what happened to flankerLetterTask.
    '/run/flankerLetterTask/:path*',
    '/run/lexicalDecisionPairs/:path*',
  ],
};
