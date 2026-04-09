import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin, hash } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? searchParams.get('redirect_to') ?? '/dashboard'
  const type = searchParams.get('type')

  // Handle token_hash (email invite/magic link flow)
  const tokenHash = searchParams.get('token_hash')
  const tokenType = searchParams.get('type')

  if (tokenHash && tokenType) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: tokenType as any,
      token_hash: tokenHash,
    })
    if (!error) {
      // Invite flow → redirect to set-password
      if (tokenType === 'invite' || tokenType === 'recovery' || tokenType === 'magiclink') {
        return NextResponse.redirect(`${origin}/auth/set-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    return NextResponse.redirect(`${origin}/auth/login?error=Invalid or expired link`)
  }

  // Handle PKCE code exchange
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // If this came from an invite, redirect to set-password
      if (type === 'invite' || type === 'recovery' || next.includes('set-password')) {
        return NextResponse.redirect(`${origin}/auth/set-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login on error
  return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate user`)
}
