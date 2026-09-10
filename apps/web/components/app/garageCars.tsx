'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'

import { AddCarButton } from '@/components/app/addCarButton'
import { CarCard } from '@/components/app/carCard'
import { EmptyGarage } from '@/components/app/emptyGarage'
import { GarageLoadFailed } from '@/components/app/garageLoadFailed'
import { GarageSkeleton } from '@/components/app/garageSkeleton'
import { AddCarSheet } from '@/components/app/addCarSheet'
import { PageHeader } from '@/components/app/pageHeader'
import { Button } from '@/components/ui/button'
import { useSession } from '@/components/auth/sessionProvider'
import { listCars, type Car } from '@/app/actions/cars'

/**
 * The garage row, and the thing that fetches it.
 *
 * Client-side, and that is forced rather than chosen: /v1 is behind Kong's
 * key-auth so CHANNEL_TOKEN has to stay on the server, and per ADR-005 the
 * access token lives only in React state — which the page, a server component,
 * cannot read. So the token is held here and passed to a server action that
 * adds the channel token.
 *
 * Because the fetch is here, the loading and failure states are here too:
 * app/(app)/garage/loading.tsx only fires when the *server* component suspends,
 * and it does not.
 */

type State =
  | { status: 'loading' }
  | { status: 'ready'; cars: Car[]; nextCursor: string | null; hasMore: boolean }
  | { status: 'failed' }

const GarageCars = () => {
  const { session, isLoading: isSessionLoading, refresh } = useSession()
  const accessToken = session?.accessToken

  const [state, setState] = useState<State>({ status: 'loading' })
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Bumped to re-request. A counter rather than a boolean so two retries in a
  // row are two different values and the effect runs both times.
  const [reload, setReload] = useState(0)

  // Guards against a response from an abandoned request overwriting a newer
  // one — a retry that resolves after the request it replaced.
  const requestId = useRef(0)

  useEffect(() => {
    // Nothing to fetch with yet. The session provider is still reading the
    // handoff, and a request without a token would only 401.
    if (isSessionLoading) return

    const id = ++requestId.current

    void (async () => {
      // No token in memory yet — a reload, where the handoff cookie is gone.
      // Minting one from the refresh cookie is the ordinary path here, not a
      // recovery, so it happens before the first request rather than after a
      // predictable 401.
      const token = accessToken ?? (await refresh())

      let result = token ? await listCars(token) : ({ status: 'unauthenticated' } as const)

      // The access token lasts 15 minutes and a garage tab can be open for
      // hours, so a 401 is expiry rather than a real refusal. One retry with a
      // fresh token; a second 401 is a genuine "sign in again", and retrying
      // further would loop.
      if (result.status === 'unauthenticated' && token) {
        const renewed = await refresh()
        result = renewed ? await listCars(renewed) : { status: 'unauthenticated' }
      }

      if (id !== requestId.current) return

      if (result.status === 'success') {
        setState({
          status: 'ready',
          cars: result.page.cars,
          nextCursor: result.page.nextCursor,
          hasMore: result.page.hasMore,
        })
        return
      }

      setState({ status: 'failed' })
    })()
  }, [accessToken, isSessionLoading, reload, refresh])

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || !state.hasMore || !accessToken || isLoadingMore) return

    setIsLoadingMore(true)
    let result = await listCars(accessToken, state.nextCursor)

    if (result.status === 'unauthenticated') {
      const renewed = await refresh()
      result = renewed ? await listCars(renewed, state.nextCursor) : { status: 'unauthenticated' }
    }

    setIsLoadingMore(false)

    if (result.status !== 'success') return

    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            // Appended, not replaced: paging adds to the row.
            cars: [...current.cars, ...result.page.cars],
            nextCursor: result.page.nextCursor,
            hasMore: result.page.hasMore,
          }
        : current
    )
  }, [accessToken, isLoadingMore, state, refresh])

  // A new car goes straight into the row. Re-reading the first page instead
  // would drop whatever further pages are already on screen.
  const addToRow = (car: Car) => {
    setState((current) =>
      current.status === 'ready' ? { ...current, cars: [car, ...current.cars] } : current
    )
  }

  const header = (
    <PageHeader
      title="Your garage"
      action={<AddCarButton label="Add car" compact onCreated={addToRow} />}
    />
  )

  if (state.status === 'loading')
    return (
      <>
        {header}
        <GarageSkeleton />
      </>
    )

  if (state.status === 'failed') {
    return (
      <>
        {header}
        <GarageLoadFailed onRetry={() => setReload((count) => count + 1)} />
      </>
    )
  }

  if (state.cars.length === 0) {
    return (
      <>
        {header}
        <EmptyGarage onCreated={addToRow} />
      </>
    )
  }

  return (
    <>
      {header}
      <div className="p-6 sm:p-8">
        <ul className="grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {state.cars.map((car) => (
            <li key={car.id}>
              <CarCard car={car} />
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="flex h-full min-h-[168px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-default text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={20} />
              Add another car
            </button>
          </li>
        </ul>

        {state.hasMore ? (
          <div className="mt-6 flex justify-center">
            <Button type="button" variant="ghost" onClick={loadMore} isLoading={isLoadingMore}>
              {isLoadingMore ? 'Loading…' : 'Show more cars'}
            </Button>
          </div>
        ) : null}

        <AddCarSheet
          key={attempt}
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          onClosed={() => setAttempt((count) => count + 1)}
          onCreated={addToRow}
        />
      </div>
    </>
  )
}

export { GarageCars }
