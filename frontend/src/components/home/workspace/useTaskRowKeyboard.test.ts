import {afterEach, describe, expect, it} from 'vitest'
import {defineComponent, h, useTemplateRef} from 'vue'
import {enableAutoUnmount, mount} from '@vue/test-utils'

import {useTaskRowKeyboard} from './useTaskRowKeyboard'

enableAutoUnmount(afterEach)

const List = defineComponent({
	setup() {
		useTaskRowKeyboard(useTemplateRef<HTMLElement>('list'))
		return () => h('div', [
			h('input', {class: 'capture'}),
			h('ul', {ref: 'list'}, [1, 2, 3].map(id => h('li', [
				h('div', {class: 'single-task', tabindex: -1, 'data-id': id}),
			]))),
		])
	},
})

function press(code: string, target: EventTarget = document.body) {
	const event = new KeyboardEvent('keydown', {code, bubbles: true, cancelable: true})
	target.dispatchEvent(event)
	return event
}

function focusedId() {
	return (document.activeElement as HTMLElement | null)?.dataset.id
}

describe('useTaskRowKeyboard', () => {
	it('moves focus down and up through the rows and stops at the ends', () => {
		mount(List, {attachTo: document.body})

		press('KeyJ')
		expect(focusedId()).toBe('1')
		press('KeyJ', document.activeElement!)
		press('KeyJ', document.activeElement!)
		press('KeyJ', document.activeElement!)
		expect(focusedId()).toBe('3')
		press('KeyK', document.activeElement!)
		expect(focusedId()).toBe('2')
	})

	it('starts at the last row on K', () => {
		mount(List, {attachTo: document.body})

		press('KeyK')
		expect(focusedId()).toBe('3')
	})

	it('leaves typing alone', () => {
		const wrapper = mount(List, {attachTo: document.body})
		const input = wrapper.get('.capture').element as HTMLInputElement
		input.focus()

		const event = press('KeyJ', input)
		expect(event.defaultPrevented).toBe(false)
		expect(document.activeElement).toBe(input)
	})
})
