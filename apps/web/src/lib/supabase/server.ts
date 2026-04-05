import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/types/database"

type CookieToSet = {
  name: string
  value: string
  options?: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2]
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOptions = {
                ...options,
                path: options?.path ?? "/",
              }

              cookieStore.set(name, value, cookieOptions)
            })
          } catch {}
        },
      },
    }
  )
}
