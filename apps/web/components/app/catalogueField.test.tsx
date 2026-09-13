import { useState } from 'react'
import { render } from '@testing-library/react'
import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { Dialog } from '@base-ui/react/dialog'
import { describe, it, expect, vi } from 'vitest'

import { CatalogueField } from '@/components/app/catalogueField'

type Make = { id: string; name: string }

const NISSAN: Make = { id: 'm1', name: 'Nissan' }
const NIO: Make = { id: 'm2', name: 'Nio' }

const Harness = ({
  search,
  onMatch = vi.fn(),
  initial = '',
}: {
  search: (text: string) => Promise<Make[]>
  onMatch?: (item: Make | null) => void
  initial?: string
}) => {
  const [value, setValue] = useState(initial)

  return (
    <CatalogueField<Make>
      label="Make"
      value={value}
      onValueChange={setValue}
      search={search}
      itemLabel={(make) => make.name}
      itemKey={(make) => make.id}
      onMatch={onMatch}
      debounceMs={0}
    />
  )
}

describe('CatalogueField', () => {
  it('suggests catalogue entries as you type', async () => {
    const user = userEvent.setup()
    const search = vi.fn(async () => [NISSAN])

    render(<Harness search={search} />)
    await user.type(screen.getByLabelText(/^MAKE$/i), 'Nis')

    expect(await screen.findByRole('option', { name: 'Nissan' })).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith('Nis')
  })

  // Suggestions are a convenience, never a gate.
  it('accepts text the catalogue does not know', async () => {
    const user = userEvent.setup()
    const onMatch = vi.fn()

    render(<Harness search={async () => []} onMatch={onMatch} />)
    await user.type(screen.getByLabelText(/^MAKE$/i), 'Caterham Seven')

    expect(screen.getByLabelText(/^MAKE$/i)).toHaveValue('Caterham Seven')
    await waitFor(() => expect(onMatch).toHaveBeenLastCalledWith(null))
  })

  it('reports a match when the text names an entry, whatever its case', async () => {
    const user = userEvent.setup()
    const onMatch = vi.fn()

    render(<Harness search={async () => [NISSAN]} onMatch={onMatch} />)
    await user.type(screen.getByLabelText(/^MAKE$/i), 'nissan')

    await waitFor(() => expect(onMatch).toHaveBeenLastCalledWith(NISSAN))
  })

  it('reports no match for text that only starts an entry', async () => {
    const user = userEvent.setup()
    const onMatch = vi.fn()

    render(<Harness search={async () => [NISSAN]} onMatch={onMatch} />)
    await user.type(screen.getByLabelText(/^MAKE$/i), 'Nis')

    await screen.findByRole('option', { name: 'Nissan' })
    expect(onMatch).toHaveBeenLastCalledWith(null)
  })

  it('fills the field and reports the match when a suggestion is chosen', async () => {
    const user = userEvent.setup()
    const onMatch = vi.fn()

    render(<Harness search={async () => [NISSAN]} onMatch={onMatch} />)
    await user.type(screen.getByLabelText(/^MAKE$/i), 'Nis')
    await user.click(await screen.findByRole('option', { name: 'Nissan' }))

    expect(screen.getByLabelText(/^MAKE$/i)).toHaveValue('Nissan')
    await waitFor(() => expect(onMatch).toHaveBeenLastCalledWith(NISSAN))
  })

  it('never lets a slow reply to an earlier search replace a later one', async () => {
    const user = userEvent.setup()
    const pending = new Map<string, (makes: Make[]) => void>()
    const search = vi.fn(
      (text: string) => new Promise<Make[]>((resolve) => pending.set(text, resolve))
    )

    render(<Harness search={search} />)
    const field = screen.getByLabelText(/^MAKE$/i)

    await user.type(field, 'N')
    await waitFor(() => expect(pending.has('N')).toBe(true))
    await user.type(field, 'i')
    await waitFor(() => expect(pending.has('Ni')).toBe(true))

    // The later search answers first, then the earlier one limps in.
    pending.get('Ni')?.([NISSAN])
    expect(await screen.findByRole('option', { name: 'Nissan' })).toBeInTheDocument()
    pending.get('N')?.([NIO])

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('option', { name: 'Nio' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Nissan' })).toBeInTheDocument()
  })

  it('closes its suggestions on Escape without closing the dialog it sits in', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <Dialog.Root open onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Popup>
            <Dialog.Title>Add a car</Dialog.Title>
            <Harness search={async () => [NISSAN]} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    )

    await user.type(screen.getByLabelText(/^MAKE$/i), 'Nis')
    expect(await screen.findByRole('option', { name: 'Nissan' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Nissan' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false, expect.anything())
  })
})
