import {describe, expect, it} from 'vitest'

import {resolveUserTimezone, SERVER_DEFAULT_TIMEZONE} from './userTimezone'

describe('resolveUserTimezone', () => {
	it('falls back to the server default when the user has no zone', () => {
		expect(resolveUserTimezone('')).toBe(SERVER_DEFAULT_TIMEZONE)
		expect(resolveUserTimezone(undefined)).toBe(SERVER_DEFAULT_TIMEZONE)
		expect(resolveUserTimezone(null)).toBe(SERVER_DEFAULT_TIMEZONE)
	})

	it('gives an unset zone the value a default-config API saves for it', () => {
		// With the stock `service.timezone` the settings endpoint stores GMT for an
		// empty zone; the resolved zone must not change across that save.
		expect(resolveUserTimezone('')).toBe(resolveUserTimezone(SERVER_DEFAULT_TIMEZONE))
	})

	it('keeps explicit zones as they are', () => {
		expect(resolveUserTimezone('Asia/Shanghai')).toBe('Asia/Shanghai')
		expect(resolveUserTimezone('America/New_York')).toBe('America/New_York')
		expect(resolveUserTimezone('UTC')).toBe('UTC')
	})

	it('is a zone Intl can format with', () => {
		expect(() => new Intl.DateTimeFormat('en', {timeZone: resolveUserTimezone('')})).not.toThrow()
	})
})
