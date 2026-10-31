import {describe, it, expect, vi, beforeAll, afterAll, afterEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import type {Editor} from '@tiptap/vue-3'

const floatingUi = vi.hoisted(() => {
	let resolvePosition: (() => void) | undefined
	return {
		// The Dropdown keeps the menu hidden until this resolves, like a real layout pass.
		computePosition: vi.fn(() => new Promise<{x: number, y: number}>(resolve => {
			resolvePosition = () => resolve({x: 0, y: 40})
		})),
		autoUpdate: vi.fn((reference: unknown, floating: unknown, update: () => void) => {
			update()
			return () => {}
		}),
		releasePosition: () => resolvePosition?.(),
	}
})

vi.mock('@floating-ui/dom', () => ({
	computePosition: floatingUi.computePosition,
	autoUpdate: floatingUi.autoUpdate,
	autoPlacement: () => ({name: 'autoPlacement'}),
	offset: () => ({name: 'offset'}),
	shift: () => ({name: 'shift'}),
	size: () => ({name: 'size'}),
}))

import EditorToolbar from './EditorToolbar.vue'

// Only the first few buttons fit on the toolbar row; the rest wrap onto a clipped
// row and move into the More menu.
const BUTTONS_ON_ROW = 4

const originalResizeObserver = globalThis.ResizeObserver
const offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')

beforeAll(() => {
	globalThis.ResizeObserver = class {
		constructor(private callback: ResizeObserverCallback) {}
		observe() {
			this.callback([], this as unknown as ResizeObserver)
		}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver

	Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
		configurable: true,
		get(this: HTMLElement) {
			const row = this.parentElement
			if (!row?.classList.contains('editor-toolbar__row')) {
				return 0
			}
			return Array.from(row.children).indexOf(this) < BUTTONS_ON_ROW ? 0 : 40
		},
	})
})

afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver
	if (offsetTop) {
		Object.defineProperty(HTMLElement.prototype, 'offsetTop', offsetTop)
	}
})

afterEach(() => {
	document.body.innerHTML = ''
})

function mountToolbar() {
	const editor = {isActive: () => false} as unknown as Editor
	return mount(EditorToolbar, {
		props: {editor},
		attachTo: document.body,
		global: {
			stubs: {Icon: true, FontAwesomeIcon: true},
			directives: {tooltip: () => {}},
			mocks: {$t: (key: string) => key},
		},
	})
}

function moreButton(wrapper: ReturnType<typeof mountToolbar>) {
	return wrapper.get<HTMLButtonElement>('.editor-toolbar__more button[aria-haspopup="true"]')
}

describe('EditorToolbar overflow menu', () => {
	it('focuses the first menu item after a keyboard open, once the menu is visible', async () => {
		const wrapper = mountToolbar()
		await flushPromises()

		const menuVisibilityOnFocus: string[] = []
		wrapper.element.addEventListener('focusin', (event: FocusEvent) => {
			const menu = (event.target as HTMLElement).closest<HTMLElement>('.dropdown-menu')
			if (menu) {
				menuVisibilityOnFocus.push(menu.style.visibility)
			}
		})

		// Enter/Space on a button dispatch a click with detail 0.
		await moreButton(wrapper).trigger('click', {detail: 0})
		await flushPromises()
		expect(moreButton(wrapper).attributes('aria-expanded')).toBe('true')

		const firstItem = wrapper.get<HTMLButtonElement>('.dropdown-menu .dropdown-item')
		// A hidden menu can't take focus; it must not be attempted yet.
		expect(document.activeElement).not.toBe(firstItem.element)

		floatingUi.releasePosition()
		await flushPromises()

		expect(document.activeElement).toBe(firstItem.element)
		expect(menuVisibilityOnFocus).toEqual(['visible'])
	})

	it('leaves focus on the trigger when the menu is opened with the mouse', async () => {
		const wrapper = mountToolbar()
		await flushPromises()

		moreButton(wrapper).element.focus()
		await moreButton(wrapper).trigger('click', {detail: 1})
		floatingUi.releasePosition()
		await flushPromises()

		expect(wrapper.get<HTMLElement>('.dropdown-menu').element.style.visibility).toBe('visible')
		expect(document.activeElement).toBe(moreButton(wrapper).element)
	})
})
