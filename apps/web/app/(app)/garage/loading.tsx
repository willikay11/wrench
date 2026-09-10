import { GarageSkeleton } from '@/components/app/garageSkeleton'
import { PageHeader } from '@/components/app/pageHeader'

/**
 * Next renders this while the page's server component awaits its data, so the
 * loading state costs no client-side state machine.
 *
 * The header is repeated rather than left out: it is identical to the one the
 * page renders, so the screen keeps its title and the content area is the only
 * thing that changes when the cars arrive.
 */
export default function Loading() {
  return (
    <>
      <PageHeader title="Your garage" />
      <GarageSkeleton />
    </>
  )
}
