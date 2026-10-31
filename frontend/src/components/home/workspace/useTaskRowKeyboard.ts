import {onBeforeUnmount, onMounted, toValue, type MaybeRefOrGetter} from 'vue'

const ROW = '.single-task'
const TYPING = 'input, textarea, select, [contenteditable="true"]'

// J and K move focus between the task rows inside `container`, like the project list.
// Enter on a focused row is handled by the row itself. Without this, 50 rows mean up to
// 250 Tab presses to get past the list.
export function useTaskRowKeyboard(container: MaybeRefOrGetter<HTMLElement | null | undefined>) {
	function onKeydown(event: KeyboardEvent) {
		if (event.code !== 'KeyJ' && event.code !== 'KeyK') return
		if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || event.defaultPrevented) return
		if (event.target instanceof Element && event.target.closest(TYPING)) return
		// A modal (task dialog, quick actions, confirm) owns the keyboard while open.
		if (document.querySelector('dialog[open]')) return

		const rows = [...(toValue(container)?.querySelectorAll<HTMLElement>(ROW) ?? [])]
		if (rows.length === 0) return

		const current = document.activeElement?.closest<HTMLElement>(ROW) ?? null
		const index = current === null ? -1 : rows.indexOf(current)
		const next = event.code === 'KeyJ'
			? Math.min(index + 1, rows.length - 1)
			: index === -1 ? rows.length - 1 : Math.max(index - 1, 0)

		event.preventDefault()
		rows[next]?.focus()
	}

	onMounted(() => document.addEventListener('keydown', onKeydown))
	onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
}
