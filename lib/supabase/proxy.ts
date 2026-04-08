import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/rbac-server'

// Routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/projects',
  '/tasks',
  '/team',
  '/reports',
  '/settings',
  '/organization',
  '/sprints',
  '/milestones',
  '/divisions',
  '/master-data',
  '/admin',
]

// Platform admin only routes
const platformOnlyRoutes = ['/admin']
const platformAllowedPrefixes = ['/admin/clients', '/settings/master-data']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect logged in users away from auth pages
  if (user && pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Check role-based route boundaries
  if (user) {
    // Use server-backed role resolution to avoid client-side join failures.
    const authCtx = await getAuthContext()
    const roleName: string | null = authCtx.role || null

    // Platform Master Admin: allow only clients + master data areas.
    if (roleName === 'master_admin') {
      const allowed = platformAllowedPrefixes.some((route) => pathname.startsWith(route))
      if (!allowed && isProtectedRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/clients'
        return NextResponse.redirect(url)
      }
    }

    // Non-master users cannot access /admin namespace.
    if (platformOnlyRoutes.some(route => pathname.startsWith(route)) && roleName !== 'master_admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
