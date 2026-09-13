'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * A text field that suggests catalogue entries as you type, and accepts
 * anything typed (ADR-010).
 *
 * Suggestions are a convenience, never a gate: a grey import or a kit car the
 * catalogue has never heard of is typed in and saved like any other car. What
 * the catalogue adds is a match — when the text names an entry, the caller is
 * told which one, and can link the car to it.
 *
 * Searches are debounced, and a reply is used only if it answers the most
 * recent search. A slow reply to "Ni" arriving after the reply to "Nissan"
 * would otherwise replace the right suggestions with stale ones.
 */

type CatalogueFieldProps<T> = {
  label: string
  placeholder?: string
  value: string
  onValueChange: (value: string) => void
  /** Suggestions for the typed text; [] when there are none. */
  search: (text: string) => Promise<T[]>
  itemLabel: (item: T) => string
  itemKey: (item: T) => string
  /** The entry the text names, or null when it names none. */
  onMatch: (item: T | null) => void
  error?: string
  helperText?: string
  /** Tests pass 0; people get enough of a pause to finish a word. */
  debounceMs?: number
}

const matchFor = <T,>(items: T[], text: string, itemLabel: (item: T) => string): T | null => {
  const wanted = text.trim().toLowerCase()
  if (!wanted) return null

  return items.find((item) => itemLabel(item).toLowerCase() === wanted) ?? null
}

function CatalogueField<T>({
  label,
  placeholder,
  value,
  onValueChange,
  search,
  itemLabel,
  itemKey,
  onMatch,
  error,
  helperText,
  debounceMs = 250,
}: CatalogueFieldProps<T>) {
  const inputId = useId()
  const messageId = `${inputId}-message`

  const [items, setItems] = useState<T[]>([])

  const latestSearch = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const valueRef = useRef(value)

  // Nothing started by this field may land after the field has gone.
  useEffect(() => {
    const searches = latestSearch
    const pending = timer
    return () => {
      clearTimeout(pending.current)
      searches.current += 1
    }
  }, [])

  const runSearch = (text: string) => {
    clearTimeout(timer.current)
    const id = ++latestSearch.current

    if (!text.trim()) {
      setItems([])
      return
    }

    timer.current = setTimeout(async () => {
      let found: T[] = []
      try {
        found = await search(text)
      } catch {
        // A failed search is no suggestions; the field still takes the text.
        found = []
      }

      if (id !== latestSearch.current) return

      setItems(found)
      // The text may now name an entry that had not arrived when it was typed.
      onMatch(matchFor(found, valueRef.current, itemLabel))
    }, debounceMs)
  }

  const handleValueChange = (next: string) => {
    valueRef.current = next
    onValueChange(next)
    // Choosing a suggestion arrives here too, as its label.
    onMatch(matchFor(items, next, itemLabel))
    runSearch(next)
  }

  const describedBy = error || helperText ? messageId : undefined

  return (
    <div className="flex w-full flex-col gap-2">
      <Label htmlFor={inputId}>{label.toUpperCase()}</Label>

      <Autocomplete.Root
        items={items}
        value={value}
        onValueChange={handleValueChange}
        itemToStringValue={itemLabel}
        // The catalogue has already filtered by the text; filtering again here
        // would hide a match that differs only in accents or spacing.
        filter={null}
      >
        <Autocomplete.Input
          id={inputId}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-12 w-full min-w-0 rounded-md border border-zinc-800 bg-neutral-900 px-2 py-0.5 text-base outline-none transition-colors',
            'placeholder:text-neutral-600 focus-visible:border-ring focus-visible:ring-ring/30 md:h-10 md:text-xs/relaxed',
            'aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/20'
          )}
        />

        <Autocomplete.Portal hidden={items.length === 0}>
          {/* Above the sheet it opens from, which sits at z-50. */}
          <Autocomplete.Positioner className="z-[60] outline-none" sideOffset={4} align="start">
            <Autocomplete.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] rounded-md border border-border-default bg-surface-elevated py-1 text-sm text-text-primary shadow-lg">
              <Autocomplete.Status className="sr-only">
                {items.length === 1 ? '1 suggestion' : `${items.length} suggestions`}
              </Autocomplete.Status>
              <Autocomplete.List className="max-h-64 overflow-y-auto overscroll-contain">
                {(item: T) => (
                  <Autocomplete.Item
                    key={itemKey(item)}
                    value={item}
                    className="cursor-default px-3 py-2 outline-none select-none data-[highlighted]:bg-primary/15"
                  >
                    {itemLabel(item)}
                  </Autocomplete.Item>
                )}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>

      {error ? (
        <p id={messageId} className="text-xs text-red-500">
          {error}
        </p>
      ) : helperText ? (
        <p id={messageId} className="text-xs text-neutral-500">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}

export { CatalogueField }
