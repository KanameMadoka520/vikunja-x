import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {defineComponent, h, ref} from 'vue'
import {mount, flushPromises, type VueWrapper} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'

import TipTap from './TipTap.vue'
import en from '@/i18n/lang/en.json'

const i18n = createI18n({legacy: false, locale: 'en', messages: {en}})
const mountedEditors: {wrapper: VueWrapper, client: QueryClient}[] = []

function mountWithDraft(draft: string) {
	localStorage.setItem('editorDraft-task-comment-1', draft)
	const text = ref('')
	const Parent = defineComponent({
		setup: () => () => h(TipTap, {
			modelValue: text.value,
			'onUpdate:modelValue': (v: string) => { text.value = v },
			storageKey: 'task-comment-1',
		}),
	})
	const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
	const wrapper = mount(Parent, {
		global: {plugins: [i18n, [VueQueryPlugin, {queryClient: client}]]},
		attachTo: document.body,
	})
	mountedEditors.push({wrapper, client})
	return wrapper
}

describe('TipTap draft restore', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => {
		mountedEditors.splice(0).forEach(({wrapper, client}) => {
			wrapper.unmount()
			client.clear()
		})
	})

	it.each([
		'<p>hello</p>',
		'<p>hello  world</p>',
		'<p>hello</p><p></p>',
		'<p>a</p><ul><li><p>b</p></li></ul>',
	])('stays in edit mode for %s', async draft => {
		const wrapper = mountWithDraft(draft)
		await flushPromises()
		await flushPromises()
		expect(wrapper.find('.tiptap__editor-is-edit-enabled').exists()).toBe(true)
	})
})
