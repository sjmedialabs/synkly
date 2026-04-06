import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  try {
    const { data: skills, error } = await supabase
      .from('skills')
      .select('*')
      .order('category')
      .order('name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ skills: skills || [] })
  } catch (err) {
    console.error('Skills API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { name, category } = body

    if (!name) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 })
    }

    const { data: skill, error } = await supabase
      .from('skills')
      .insert({ name, category })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Skill already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ skill })
  } catch (err) {
    console.error('Create skill error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
