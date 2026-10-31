import {useUpdateFrontendSettingsMutation} from '@/client/queries/account'
import {ref, computed, onMounted, onUnmounted, watch} from 'vue'
import {useAuthStore} from '@/stores/auth'

import {useIsMobile} from '@/composables/useIsMobile'
export const DEFAULT_SIDEBAR_WIDTH = 300
export const MIN_SIDEBAR_WIDTH = 200
export const MAX_SIDEBAR_WIDTH = 500
const KEYBOARD_STEP = 16
const KEYBOARD_SAVE_DELAY = 500
const MOBILE_DRAWER_WIDTH = 'clamp(16rem, 85vw, 20rem)'

function clampWidth(width: number): number {
	return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width))
}

// Shared state across all component instances
const isResizing = ref(false)
const currentWidth = ref(DEFAULT_SIDEBAR_WIDTH)
let initialized = false
let watcherInitialized = false
// While a keyboard save is pending, an older settings echo must not undo newer key presses.
let keyboardSaveTimer: ReturnType<typeof setTimeout> | undefined

// Captured body styles to restore after resize
let previousUserSelect: string | undefined
let previousCursor: string | undefined

function setupWatcher(authStore: ReturnType<typeof useAuthStore>) {
	if (watcherInitialized) return
	watcherInitialized = true

	watch(
		() => authStore.settings?.frontend_settings?.sidebar_width,
		(newWidth) => {
			if (isResizing.value || keyboardSaveTimer !== undefined) return

			if (newWidth !== null && newWidth !== undefined) {
				currentWidth.value = clampWidth(newWidth)
			} else {
				currentWidth.value = DEFAULT_SIDEBAR_WIDTH
			}
		},
	)
}

export function useSidebarResize() {
	const authStore = useAuthStore()
	const updateFrontendSettings = useUpdateFrontendSettingsMutation()
	const isMobile = useIsMobile()

	// Initialize width from settings only once
	onMounted(() => {
		if (initialized) return
		initialized = true

		const savedWidth = authStore.settings?.frontend_settings?.sidebar_width
		if (savedWidth !== null && savedWidth !== undefined) {
			currentWidth.value = clampWidth(savedWidth)
		}
	})

	// Register settings watcher only once
	setupWatcher(authStore)

	const sidebarWidthStyle = computed(() => {
		if (isMobile.value) {
			return MOBILE_DRAWER_WIDTH
		}
		return `${currentWidth.value}px`
	})

	function startResize(event: MouseEvent | TouchEvent) {
		if (isMobile.value) return

		event.preventDefault()
		isResizing.value = true

		document.addEventListener('mousemove', handleResize)
		document.addEventListener('mouseup', stopResize)
		document.addEventListener('touchmove', handleResize)
		document.addEventListener('touchend', stopResize)

		// Capture current styles and set new values
		previousUserSelect = document.body.style.userSelect
		previousCursor = document.body.style.cursor
		document.body.style.userSelect = 'none'
		document.body.style.cursor = 'ew-resize'
	}

	function handleResize(event: MouseEvent | TouchEvent) {
		if (!isResizing.value) return

		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX

		// Handle RTL direction
		const isRtl = document.dir === 'rtl'
		let newWidth: number

		if (isRtl) {
			newWidth = window.innerWidth - clientX
		} else {
			newWidth = clientX
		}

		currentWidth.value = clampWidth(newWidth)
	}

	function stopResize() {
		if (!isResizing.value) return

		isResizing.value = false

		document.removeEventListener('mousemove', handleResize)
		document.removeEventListener('mouseup', stopResize)
		document.removeEventListener('touchmove', handleResize)
		document.removeEventListener('touchend', stopResize)

		// Restore previous styles
		if (previousUserSelect !== undefined) {
			document.body.style.userSelect = previousUserSelect
			previousUserSelect = undefined
		}
		if (previousCursor !== undefined) {
			document.body.style.cursor = previousCursor
			previousCursor = undefined
		}

		// Save width to user settings
		saveWidth()
	}

	async function saveWidth() {
		const savedWidth = authStore.settings?.frontend_settings?.sidebar_width
		// Only save if width actually changed
		if (savedWidth === currentWidth.value) return

		const session = authStore.session
		if (!session) return
		try {
			await updateFrontendSettings.mutateAsync({
				id: session.id,
				type: session.type,
				frontendSettings: {sidebar_width: currentWidth.value},
			})
		} catch { return }
	}

	// Key presses arrive in bursts, so only the width the user settles on is saved.
	function setWidthDeferred(width: number) {
		currentWidth.value = clampWidth(width)
		clearTimeout(keyboardSaveTimer)
		keyboardSaveTimer = setTimeout(() => {
			keyboardSaveTimer = undefined
			void saveWidth()
		}, KEYBOARD_SAVE_DELAY)
	}

	// Window splitter keys (WAI-ARIA APG): arrows step, Home/End jump to the limits.
	function resizeWithKeyboard(event: KeyboardEvent) {
		if (isMobile.value || isResizing.value) return

		const towardsEnd = document.dir === 'rtl' ? -1 : 1
		let width: number
		switch (event.key) {
			case 'ArrowLeft':
				width = currentWidth.value - KEYBOARD_STEP * towardsEnd
				break
			case 'ArrowRight':
				width = currentWidth.value + KEYBOARD_STEP * towardsEnd
				break
			case 'Home':
				width = MIN_SIDEBAR_WIDTH
				break
			case 'End':
				width = MAX_SIDEBAR_WIDTH
				break
			default:
				return
		}
		event.preventDefault()
		setWidthDeferred(width)
	}

	function resetWidth() {
		if (isMobile.value) return
		setWidthDeferred(DEFAULT_SIDEBAR_WIDTH)
	}

	// Cleanup on unmount
	onUnmounted(stopResize)

	return {
		sidebarWidthStyle,
		currentWidth,
		isResizing,
		startResize,
		resizeWithKeyboard,
		resetWidth,
		isMobile,
		DEFAULT_SIDEBAR_WIDTH,
		MIN_SIDEBAR_WIDTH,
		MAX_SIDEBAR_WIDTH,
	}
}
