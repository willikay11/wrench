import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// EmptyGarage renders AddCarButton, which now keeps the add-car sheet mounted
// so its slide-out can play. The sheet refreshes the garage on success.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { EmptyGarage } from '@/components/app/emptyGarage'
import { GarageSkeleton } from '@/components/app/garageSkeleton'
import GarageError from '@/app/(app)/garage/error'
import GarageLoading from '@/app/(app)/garage/loading'

/*
The garage has three ways of having nothing to show — still loading, nothing
there, and could not load — and they used to be one. These tests hold them
apart: each says its own thing, and no two can be mistaken for each other.
*/

describe('the garage loading state', () => {
  it('says it is loading rather than showing an empty garage', () => {
    render(<GarageSkeleton />)

    expect(screen.getByText(/Loading your garage/i)).toBeInTheDocument()

    // The wrong message at the wrong moment: someone with a full garage
    // must never read this while their cars are still on the way.
    expect(screen.queryByText(/garage is empty/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add your first car/i })).not.toBeInTheDocument()
  })

  it('marks itself busy so assistive tech does not read the placeholders as content', () => {
    const { container } = render(<GarageSkeleton />)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('keeps the page title while the cars load, so the screen does not change shape', () => {
    render(<GarageLoading />)

    expect(screen.getByRole('heading', { level: 1, name: 'Your garage' })).toBeInTheDocument()
    expect(screen.getByText(/Loading your garage/i)).toBeInTheDocument()
  })
})

describe('the garage empty state', () => {
  it('states the fact and names what a car unlocks', () => {
    render(<EmptyGarage />)

    expect(
      screen.getByRole('heading', { level: 2, name: /Your garage is empty/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/mods, service and budget/i)).toBeInTheDocument()
  })

  it('says up front what the form will ask for', () => {
    render(<EmptyGarage />)

    expect(screen.getByText(/Year, make, model, engine and how you use it/i)).toBeInTheDocument()
  })

  it('is a landmark named by its heading, so it is reachable by structure', () => {
    render(<EmptyGarage />)

    expect(screen.getByRole('region', { name: /Your garage is empty/i })).toBeInTheDocument()
  })
})

describe('the garage error state', () => {
  const failure = Object.assign(new Error('fetch failed: ECONNREFUSED 10.0.0.4:8000'), {
    digest: 'abc123',
  })

  it('says the load failed, not that the garage is empty', () => {
    render(<GarageError error={failure} unstable_retry={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/could not load your garage/i)).toBeInTheDocument()

    // The lie this whole state exists to prevent.
    expect(screen.queryByText(/garage is empty/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add your first car/i })).not.toBeInTheDocument()
  })

  it('reassures that the cars still exist, because a failed read says nothing about them', () => {
    render(<GarageError error={failure} unstable_retry={vi.fn()} />)

    expect(screen.getByText(/Your cars are safe/i)).toBeInTheDocument()
  })

  it('offers a retry that re-fetches', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()

    render(<GarageError error={failure} unstable_retry={retry} />)

    await user.click(screen.getByRole('button', { name: /Try again/i }))

    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('shows the digest but never the error message, which can carry internals', () => {
    render(<GarageError error={failure} unstable_retry={vi.fn()} />)

    expect(screen.getByText(/abc123/)).toBeInTheDocument()
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument()
    expect(screen.queryByText(/10\.0\.0\.4/)).not.toBeInTheDocument()
  })

  it('omits the reference line when there is no digest to quote', () => {
    render(<GarageError error={new Error('boom')} unstable_retry={vi.fn()} />)

    expect(screen.queryByText(/Reference:/i)).not.toBeInTheDocument()
  })
})
