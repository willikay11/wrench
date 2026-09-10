// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { formatLastService, formatMileage, formatResetDate } from './format'

describe('formatMileage', () => {
    it('groups thousands, as the sidebar draws it', () => {
        expect(formatMileage(91204)).toBe('91,204 mi')
        expect(formatMileage(0)).toBe('0 mi')
        expect(formatMileage(999)).toBe('999 mi')
    })
})

describe('formatLastService', () => {
    const now = new Date('2026-08-28T12:00:00Z')
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

    const DAY = 86_400_000

    it('reads as a glance, not a date', () => {
        expect(formatLastService(ago(14 * DAY), now)).toBe('2 wks ago')
        expect(formatLastService(ago(3 * DAY), now)).toBe('3 d ago')
        expect(formatLastService(ago(5 * 3_600_000), now)).toBe('5 hr ago')
        expect(formatLastService(ago(90 * DAY), now)).toBe('3 mo ago')
        expect(formatLastService(ago(400 * DAY), now)).toBe('1 yr ago')
    })

    // Clock skew between the API and the browser, not a booking.
    it('does not report a future service as negative', () => {
        expect(formatLastService(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(
            'just now',
        )
    })

    it('says so rather than printing Invalid Date', () => {
        expect(formatLastService('not-a-date', now)).toBe('Unknown')
    })
})

describe('formatResetDate', () => {
    it('renders the short date under the usage bar', () => {
        expect(formatResetDate('2026-08-01T00:00:00Z')).toBe('Aug 1')
    })

    it('is empty rather than wrong on a bad value', () => {
        expect(formatResetDate('nonsense')).toBe('')
    })
})
