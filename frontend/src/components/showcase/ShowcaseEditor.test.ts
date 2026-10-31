import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {VueQueryPlugin} from '@tanstack/vue-query'

const sdk = vi.hoisted(() => ({
	projectsList: vi.fn(),
	tcyShowcaseSettings: vi.fn(),
	tcyShowcaseSave: vi.fn(),
	tcyShowcasePreview: vi.fn(),
	tcyShowcasePublish: vi.fn(),
	tcyShowcaseUnpublish: vi.fn(),
	tcyShowcasePublic: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({success: vi.fn(), error: vi.fn()}))

import ShowcaseEditor from './ShowcaseEditor.vue'
import XButton from '@/components/input/Button.vue'
import type {Project, TcyShowcaseSettingsResponse} from '@/client/generated'
import {queryClient} from '@/client/queryClient'
import {guides} from '@/helpers/guidedTour'
import {i18n} from '@/i18n'
import en from '@/i18n/lang/en.json'

// The real useProjects is used on purpose: a mock with a different shape (a ref instead of the
// reactive state) once hid a render crash that left the whole settings page blank.
const projects: Project[] = [
	{id: 4, title: 'Thesis', is_archived: false},
	{id: 9, title: 'Reading list', is_archived: false},
	{id: 7, title: 'Old archive', is_archived: true},
	{id: -1, title: 'Favorites'},
	{id: -2, title: 'Saved filter'},
]

let wrapper: VueWrapper | undefined
let renderErrors: unknown[] = []

beforeEach(() => {
	vi.resetAllMocks()
	renderErrors = []
	setActivePinia(createPinia())
	i18n.global.setLocaleMessage('en', en)
	i18n.global.locale.value = 'en'
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
	queryClient.clear()
})

function projectPage(items: Project[]) {
	return {data: {items, total_pages: 1}}
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>(done => {
		resolve = done
	})
	return {promise, resolve}
}

function mountEditor(initial: TcyShowcaseSettingsResponse) {
	wrapper = mount(ShowcaseEditor, {
		attachTo: document.body,
		props: {initial},
		global: {
			// Same client as the app: useProjects reads the shared module client directly.
			plugins: [i18n, [VueQueryPlugin, {queryClient}]],
			components: {XButton},
			stubs: {Icon: true},
			config: {
				errorHandler(err: unknown) {
					renderErrors.push(err)
				},
			},
		},
	})
	return wrapper
}

function buttonNamed(name: string) {
	const button = wrapper!.findAll('button').find(candidate => candidate.text() === name)
	if (!button) throw new Error(`No button "${name}"`)
	return button
}

function projectOptions() {
	return wrapper!.find('select[aria-label="Select a project"]').findAll('option').map(option => option.text())
}

describe('ShowcaseEditor', () => {
	it.each([
		['an unpublished draft', {draft: {slug: 'tcy', title: 'Draft page'}}, 'Not published'],
		['a published page', {draft: {slug: 'tcy', title: 'Draft page'}, published: {slug: 'tcy'}}, 'Published'],
	])('renders the page heading and every showcase tour anchor for %s', async (_case, initial, status) => {
		sdk.projectsList.mockResolvedValue(projectPage(projects))
		mountEditor(initial)
		await flushPromises()

		expect(renderErrors).toEqual([])
		const headings = wrapper!.findAll('h1')
		expect(headings).toHaveLength(1)
		expect(headings[0]!.text()).toBe('Public page')
		expect(wrapper!.find('[data-tour="showcase-status"]').text()).toContain(status)
		// Each guide step needs its anchor on the page, otherwise the tour shows "This area is unavailable".
		const targets = guides.showcase.steps.map(step => step.target)
		expect(targets).toHaveLength(6)
		for (const target of targets) {
			const anchor = wrapper!.find(`[data-tour="${target}"]`)
			expect(anchor.exists(), target).toBe(true)
			expect(anchor.isVisible(), target).toBe(true)
		}
	})

	it('lists projects that finish loading after the editor mounted', async () => {
		const pending = deferred<ReturnType<typeof projectPage>>()
		sdk.projectsList.mockReturnValue(pending.promise)
		mountEditor({draft: {slug: 'tcy', projects: [{id: 9, mode: 'busy'}]}})
		await flushPromises()

		expect(renderErrors).toEqual([])
		expect(projectOptions()).toEqual(['Select a project'])
		expect(wrapper!.find('.project-rule .rule-name').text()).toBe('Project #9')

		pending.resolve(projectPage(projects))
		await flushPromises()

		// Archived projects, favourites and saved filters cannot be published.
		expect(projectOptions()).toEqual(['Select a project', 'Thesis', 'Reading list'])
		expect(wrapper!.find('.project-rule .rule-name').text()).toBe('Reading list')
		await wrapper!.find('select[aria-label="Select a project"]').setValue('4')
		await buttonNamed('Add project rule').trigger('click')
		expect(wrapper!.findAll('.project-rule .rule-name').map(name => name.text())).toEqual(['Reading list', 'Thesis'])
		expect(renderErrors).toEqual([])
	})

	it('keeps publishing gated behind a preview of the current draft', async () => {
		sdk.projectsList.mockResolvedValue(projectPage([]))
		sdk.tcyShowcasePreview.mockResolvedValue({data: {
			page: {
				title: 'Draft page',
				content: '# Custom',
				format: 'markdown',
				events: [],
				free: [],
				projects: [],
			},
			sources: [],
		}})
		mountEditor({draft: {slug: 'tcy', title: 'Draft page'}})
		await flushPromises()

		const publish = buttonNamed('Publish this preview')
		expect(publish.attributes('aria-disabled')).toBe('true')
		const hint = wrapper!.find(`#${publish.attributes('aria-describedby')}`)
		expect(hint.text()).toBe('Preview the current draft to enable publishing.')
		await publish.trigger('click')
		await flushPromises()
		expect(sdk.tcyShowcasePublish).not.toHaveBeenCalled()

		await buttonNamed('Preview public page').trigger('click')
		await flushPromises()

		expect(buttonNamed('Publish this preview').attributes('aria-disabled')).toBeUndefined()
		expect(wrapper!.findAll('h2').map(h => h.text())).toContain('What visitors will see')
		expect(wrapper!.findAll('iframe')).toHaveLength(1)
		expect(wrapper!.findAll('h1')).toHaveLength(1)

		await wrapper!.find('input[maxlength="100"]').setValue('Changed title')
		expect(buttonNamed('Publish this preview').attributes('aria-disabled')).toBe('true')
		expect(renderErrors).toEqual([])
	})
})
