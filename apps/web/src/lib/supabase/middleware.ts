// apps/web/src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

type CookieToSet = {
  name: string
  value: string
  options?: Parameters<NextResponse["cookies"]["set"]>[2]
}

export async function updateSession(request: NextRequest) {
  const cookieValue = request.cookies.get("sb-wrench-auth-token")?.value
  console.log("Auth cookie value:", cookieValue?.substring(0, 50))

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              path: options?.path ?? "/",
            }
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, cookieOptions)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  console.log("Path:", request.nextUrl.pathname, "| User:", user?.email ?? "null")

  const protectedRoutes = ["/builds", "/dashboard", "/profile", "/settings"]
  const isProtected = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  )

  if (!user && isProtected) {
    const loginUrl = new URL("/auth/login", request.url)
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    )

    const redirectResponse = NextResponse.redirect(loginUrl)

    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })

    return redirectResponse
  }

  return supabaseResponse
}