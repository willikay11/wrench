import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/types/database"

type BrowserAuthFlowType = "pkce" | "implicit"

interface CreateClientOptions {
  flowType?: BrowserAuthFlowType
}

export function createClient(options?: CreateClientOptions) {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: options?.flowType ?? "pkce",
      },
    }
  )
}
