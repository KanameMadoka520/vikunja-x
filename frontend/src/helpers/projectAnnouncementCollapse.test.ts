import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {effectScope, nextTick, ref} from 'vue'

import {
	announcementCollapseStorageKey,
	isAnnouncementCollapsed,
	setAnnouncementCollapsed,
	useAnnouncementCollapse,
} from './projectAnnouncementCollapse'

const userKey = announcementCollapseStorageKey('https://a.example/api/v2', {id: 1, linkShare: false})

describe('announcementCollapseStorageKey', () => {
	it('separates API servers, accounts and link shares', () => {
		const keys = new Set([
			userKey,
			announcementCollapseStorageKey('https://b.example/api/v2', {id: 1, linkShare: false}),
			announcementCollapseStorageKey('https://a.example/api/v2', {id: 2, linkShare: false}),
			announcementCollapseStorageKey('https://a.example/api/v2', {id: 1, linkShare: true}),
		])

		expect(keys.size).toBe(4)
		expect(userKey).toBe('tcymc-announcement:v1:https%3A%2F%2Fa.example%2Fapi%2Fv2:1')
	})
})

describe('announcement collapse state', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => vi.unstubAllGlobals())

	it('keeps exactly the collapsed revision collapsed', () => {
		setAnnouncementCollapsed(userKey, 7, 3, true)

		expect(isAnnouncementCollapsed(userKey, 7, 3)).toBe(true)
		expect(isAnnouncementCollapsed(userKey, 7, 4)).toBe(false)
		expect(isAnnouncementCollapsed(userKey, 8, 3)).toBe(false)
		expect(JSON.parse(localStorage.getItem(userKey)!)).toEqual({7: 3})
	})

	it('expands again and leaves other projects alone', () => {
		setAnnouncementCollapsed(userKey, 7, 3, true)
		setAnnouncementCollapsed(userKey, 8, 1, true)
		setAnnouncementCollapsed(userKey, 7, 3, false)

		expect(isAnnouncementCollapsed(userKey, 7, 3)).toBe(false)
		expect(isAnnouncementCollapsed(userKey, 8, 1)).toBe(true)
	})

	it('never collapses an unset announcement', () => {
		setAnnouncementCollapsed(userKey, 7, 0, true)

		expect(isAnnouncementCollapsed(userKey, 7, 0)).toBe(false)
	})

	it('ignores unreadable stored values', () => {
		localStorage.setItem(userKey, '{not json')
		expect(isAnnouncementCollapsed(userKey, 7, 3)).toBe(false)

		localStorage.setItem(userKey, JSON.stringify({7: 'x', 8: -1, 9: 2}))
		expect(isAnnouncementCollapsed(userKey, 7, 3)).toBe(false)
		expect(isAnnouncementCollapsed(userKey, 9, 2)).toBe(true)
	})

	it('still toggles for the session when storage refuses writes', () => {
		const key = announcementCollapseStorageKey('https://quota.example/api/v2', {id: 1, linkShare: false})
		vi.stubGlobal('localStorage', {
			getItem: () => null,
			setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError') },
		})

		setAnnouncementCollapsed(key, 7, 2, true)

		expect(isAnnouncementCollapsed(key, 7, 2)).toBe(true)
	})
})

describe('useAnnouncementCollapse', () => {
	beforeEach(() => localStorage.clear())

	it('reacts to its own writes and to a newer revision', async () => {
		const revision = ref(3)
		const scope = effectScope()
		const state = scope.run(() => useAnnouncementCollapse(userKey, 7, revision))!

		expect(state.collapsed.value).toBe(false)
		state.setCollapsed(true)
		expect(state.collapsed.value).toBe(true)

		revision.value = 4
		await nextTick()
		expect(state.collapsed.value).toBe(false)
		scope.stop()
	})

	it('picks up a change made in another tab', () => {
		const scope = effectScope()
		const state = scope.run(() => useAnnouncementCollapse(userKey, 7, 5))!
		expect(state.collapsed.value).toBe(false)

		localStorage.setItem(userKey, JSON.stringify({7: 5}))
		window.dispatchEvent(new StorageEvent('storage', {key: userKey}))

		expect(state.collapsed.value).toBe(true)
		scope.stop()
	})
})
