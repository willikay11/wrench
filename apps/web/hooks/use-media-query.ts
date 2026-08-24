"use client"

import * as React from "react"

/**
 * Subscribes to a CSS media query.
 *
 * useSyncExternalStore rather than useState + useEffect: matchMedia is an
 * external store, and this is the API React provides for reading one. It also
 * avoids tearing during concurrent rendering, and returns the correct value on
 * the first client render instead of flashing the default.
 */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    [query]
  )

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server render: no window, and no way to know. Matches the previous
    // useState(false) initial value.
    () => false
  )
}
