import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect, vi } from 'vitest'

import GaragePage from './page'

const listCars = vi.fn()
vi.mock('@/app/actions/cars', () => ({
  listCars: (...args: unknown[]) => listCars(...args),
  createCar: vi.fn(),
  uploadCarPhoto: vi.fn(),
}))
vi.mock('@/app/actions/catalogue', () => ({
  searchMakes: vi.fn(async () => ({ status: 'success', items: [] })),
  searchModels: vi.fn(async () => ({ status: 'success', items: [] })),
  findGenerations: vi.fn(async () => ({ status: 'success', items: [] })),
}))
vi.mock('@/components/auth/sessionProvider', () => ({
  useSession: () => ({ session: { accessToken: 'token' }, isLoading: false, refresh: vi.fn() }),
}))

describe('GaragePage', () => {
  it('names the screen and offers the header action', async () => {
    listCars.mockResolvedValue({
      status: 'success',
      page: { cars: [], nextCursor: null, hasMore: false, total: 0 },
    })

    render(<GaragePage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Your garage' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Add car/i })).toBeInTheDocument()
  })

  it('shows the empty state once the API has answered with no cars', async () => {
    listCars.mockResolvedValue({
      status: 'success',
      page: { cars: [], nextCursor: null, hasMore: false, total: 0 },
    })

    render(<GaragePage />)

    expect(
      await screen.findByRole('heading', { level: 2, name: /Your garage is empty/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/mods, service and budget/i)).toBeInTheDocument()
  })

  it('shows the cars when the API returns some', async () => {
    listCars.mockResolvedValue({
      status: 'success',
      page: {
        cars: [
          {
            id: '1',
            make: 'Nissan',
            model: '350Z',
            year: 2003,
            engine: 'VQ35DE 3.5L V6',
            usageType: 'track',
          },
        ],
        nextCursor: null,
        hasMore: false,
        total: 1,
      },
    })

    render(<GaragePage />)

    expect(await screen.findByRole('article', { name: /2003 Nissan 350Z/i })).toBeInTheDocument()
    expect(screen.queryByText(/garage is empty/i)).not.toBeInTheDocument()
  })
})
