import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Public routes that don't require authentication
const publicPaths = [
  '/auth/signin',
  '/api/auth',
  '/api/track',
  '/api/collect',
  '/api/batch',
  '/api/websites/config',
  '/api/vitals',
  '/api/v1',
  '/docs',
  ...(process.env.IS_MULTI_TENANT === 'true' ? ['/auth/signup', '/onboarding'] : []),
]

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(p => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // CORS for tracking endpoints
  if (pathname.startsWith('/api/track/') || pathname.startsWith('/api/collect') || pathname.startsWith('/api/batch')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    const response = NextResponse.next()
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return response
  }

  // Skip auth check for public paths and static assets
  if (isPublicPath(pathname) || pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Check session for protected routes
  const token = await getToken({ req: request })

  if (!token) {
    const signInUrl = new URL('/auth/signin', request.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|\\.well-known/workflow/).*)',
  ],
}
