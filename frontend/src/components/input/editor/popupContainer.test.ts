import {describe, it, expect, afterEach} from 'vitest'

import {getViewportBelowNavbar} from './popupContainer'

function addNavbar(position: string, bottom: number) {
	const navbar = document.createElement('nav')
	navbar.className = 'navbar'
	navbar.style.position = position
	navbar.getBoundingClientRect = () => new DOMRect(0, 0, 1280, bottom)
	document.body.appendChild(navbar)
}

function addPopup(parent: HTMLElement = document.body) {
	const popup = document.createElement('div')
	parent.appendChild(popup)
	return popup
}

describe('getViewportBelowNavbar', () => {
	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('leaves out the part of the viewport covered by the fixed navbar', () => {
		addNavbar('fixed', 52)
		const root = document.documentElement
		Object.defineProperty(root, 'clientWidth', {configurable: true, value: 1280})
		Object.defineProperty(root, 'clientHeight', {configurable: true, value: 720})

		try {
			expect(getViewportBelowNavbar(addPopup())).toEqual({x: 0, y: 52, width: 1280, height: 668})
		} finally {
			Reflect.deleteProperty(root, 'clientWidth')
			Reflect.deleteProperty(root, 'clientHeight')
		}
	})

	it('uses the whole viewport when the navbar scrolls with the page', () => {
		addNavbar('static', 52)
		expect(getViewportBelowNavbar(addPopup())).toBe('viewport')
	})

	it('uses the whole viewport without a navbar', () => {
		expect(getViewportBelowNavbar(addPopup())).toBe('viewport')
	})

	it('uses the whole viewport inside an open dialog, which is drawn over the navbar', () => {
		addNavbar('fixed', 52)
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		document.body.appendChild(dialog)
		expect(getViewportBelowNavbar(addPopup(dialog))).toBe('viewport')
	})
})
