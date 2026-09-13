import type { Metadata } from 'next'

import { GarageCars } from '@/components/app/garageCars'

export const metadata: Metadata = {
  title: 'Your garage · Wrench',
  // Behind a sign-in, so there is nothing here for a crawler to reach.
  robots: { index: false, follow: false },
}

/**
 * The page is a shell. The cars are fetched by GarageCars, which is a client
 * component because the access token it needs lives in memory and never
 * reaches the server — see the note there.
 */
export default function GaragePage() {
  // GarageCars renders the header too, so the header's Add car button and the
  // row share one list — a car added from either lands in the same place.
  return <GarageCars />
}
