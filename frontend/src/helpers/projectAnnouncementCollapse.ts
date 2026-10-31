import {computed, ref, toValue, type MaybeRefOrGetter} from 'vue'
import {useEventListener} from '@vueuse/core'

export type AnnouncementAccount = {
	id: number
	linkShare: boolean
}

// Projects (by id) mapped to the announcement revision the user collapsed.
type CollapsedRevisions = Record<string, number>

/**
 * Collapsing is a personal preference, kept apart per account and API server like the guided tours.
 * Link shares get their own namespace: their ids count separately from user ids.
 */
export function announcementCollapseStorageKey(apiBaseUrl: string, account: AnnouncementAccount): string {
	const accountKey = account.linkShare ? `link-${account.id}` : String(account.id)
	return `tcymc-announcement:v1:${encodeURIComponent(apiBaseUrl)}:${accountKey}`
}

// Holds what storage refused to keep (private mode, full quota) so the toggle still works this session.
// The empty key (no known account) only ever lives here.
const unsaved = new Map<string, CollapsedRevisions>()

function readCollapsed(storageKey: string): CollapsedRevisions {
	const pending = unsaved.get(storageKey)
	if (pending || storageKey === '') return pending ?? {}
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return Object.fromEntries(Object.entries(parsed)
				.filter((entry): entry is [string, number] => Number.isInteger(entry[1]) && entry[1] > 0))
		}
	} catch {
		// Unreadable or hand-edited: treat as nothing collapsed.
	}
	return {}
}

/**
 * Only the exact revision the user collapsed stays collapsed: a newer one (an edit, or a notice
 * cleared and written again) opens expanded, so new content is never hidden by an old choice.
 */
export function isAnnouncementCollapsed(storageKey: string, projectId: number, revision: number): boolean {
	return revision > 0 && readCollapsed(storageKey)[projectId] === revision
}

export function setAnnouncementCollapsed(storageKey: string, projectId: number, revision: number, collapsed: boolean) {
	const next = {...readCollapsed(storageKey)}
	if (collapsed && revision > 0) {
		next[projectId] = revision
	} else {
		delete next[projectId]
	}
	if (storageKey === '') {
		unsaved.set(storageKey, next)
		return
	}
	try {
		localStorage.setItem(storageKey, JSON.stringify(next))
		unsaved.delete(storageKey)
	} catch {
		unsaved.set(storageKey, next)
	}
}

export function useAnnouncementCollapse(
	storageKey: MaybeRefOrGetter<string>,
	projectId: MaybeRefOrGetter<number>,
	revision: MaybeRefOrGetter<number>,
) {
	// Storage is not reactive: own writes and writes from other tabs bump this to re-read it.
	const version = ref(0)
	useEventListener(window, 'storage', event => {
		if (event.key === null || event.key === toValue(storageKey)) {
			version.value++
		}
	})

	const collapsed = computed(() => {
		void version.value
		return isAnnouncementCollapsed(toValue(storageKey), toValue(projectId), toValue(revision))
	})

	function setCollapsed(value: boolean) {
		setAnnouncementCollapsed(toValue(storageKey), toValue(projectId), toValue(revision), value)
		version.value++
	}

	return {collapsed, setCollapsed}
}
