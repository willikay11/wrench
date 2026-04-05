// apps/web/src/app/api/auth/login/route.ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import type { Database } from "@/types/database"

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
})

export async function POST(req: Request) {
  const body = await req.json()

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data." },
      { status: 400 }
    )
  }

  const { email, password, next } = parsed.data
  const redirectTo = next?.startsWith("/") ? next : "/dashboard"
  const { origin } = new URL(req.url)

  const cookieStore = await cookies()
  const response = NextResponse.redirect(`${origin}${redirectTo}`, {
    status: 303,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const opts = { ...options, path: options?.path ?? "/" }
            try { cookieStore.set(name, value, opts) } catch {}
            response.cookies.set(name, value, opts)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return response
}