import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'

const sdk = vi.hoisted(() => ({
	driveList: vi.fn(),
	driveUsages: vi.fn(),
	driveUpload: vi.fn(),
	driveChange: vi.fn(),
	driveAttach: vi.fn(),
	driveCover: vi.fn(),
	driveDownload: vi.fn(),
	drivePreview: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({success: vi.fn(), error: vi.fn()}))

import DriveBrowser from './DriveBrowser.vue'
import en from '@/i18n/lang/en.json'

const i18n = createI18n({legacy: false, locale: 'en', messages: {en}})

function file(id: number, overrides: Record<string, unknown> = {}) {
	return {
		file_id: id,
		revision: 1,
		category: '',
		pinned: false,
		file: {
			id,
			name: `document-${id}.txt`,
			mime: 'text/plain',
			size: 2048,
			created: '2026-10-30T09:00:00Z',
		},
		...overrides,
	}
}

let client: QueryClient
let wrapper: VueWrapper | undefined

beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	setActivePinia(createPinia())
	client = new QueryClient({defaultOptions: {queries: {retry: false}}})
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
})

function mountBrowser(props: {picker?: boolean, images?: boolean, busy?: boolean} = {}) {
	wrapper = mount(DriveBrowser, {
		attachTo: document.body,
		props,
		global: {
			plugins: [i18n, [VueQueryPlugin, {queryClient: client}]],
			stubs: {
				XButton: {template: '<button type="button" v-bind="$attrs"><slot /></button>'},
				Modal: true,
				Icon: true,
				RouterLink: true,
			},
			directives: {tooltip: {}},
		},
	})
	return wrapper
}

function buttonsNamed(name: string) {
	return wrapper!.findAll('button').filter(button => button.text() === name || button.attributes('aria-label') === name)
}

describe('DriveBrowser', () => {
	it('renders every file as a card with its pinned marker, category and labelled actions', async () => {
		sdk.driveList.mockResolvedValue({data: {
			files: [file(1, {pinned: true, category: 'Work'}), file(2)],
			total: 2,
			bytes: 3 * 1024 * 1024 * 1024,
			categories: ['Work'],
		}})
		mountBrowser()
		await flushPromises()

		expect(wrapper!.find('h1').text()).toBe('My Drive')
		const cards = wrapper!.findAll('.drive-card')
		expect(cards).toHaveLength(2)
		expect(cards[0].text()).toContain('★ document-1.txt')
		expect(cards[0].text()).toContain('Work')
		expect(cards[0].findAll('button').filter(b => b.text() === 'Details and usages')).toHaveLength(1)
		expect(cards[0].findAll('button').filter(b => b.text() === 'Move to recycle bin')).toHaveLength(1)
		// The thumbnail button is a mouse shortcut and must not add a second accessible name per card.
		expect(cards[0].find('.drive-preview').attributes('aria-hidden')).toBe('true')
		expect(wrapper!.find('.drive-summary').text()).toContain('3 GiB')
		expect(wrapper!.findAll('input[type=search]')).toHaveLength(1)
		expect(wrapper!.find('.drive-browser input[type=file]').exists()).toBe(true)
		expect(wrapper!.find('.drive-toolbar').findAll('button').filter(b => b.text() === 'Recycle bin')).toHaveLength(1)
	})

	it('offers exactly one choose button per file in picker mode', async () => {
		sdk.driveList.mockResolvedValue({data: {files: [file(3)], total: 1, bytes: 10, categories: []}})
		mountBrowser({picker: true})
		await flushPromises()

		const choose = buttonsNamed('Choose from Drive')
		expect(choose).toHaveLength(1)
		expect(wrapper!.find('h1').exists()).toBe(false)
		expect(buttonsNamed('Recycle bin')).toHaveLength(0)
		await choose[0].trigger('click')
		expect(wrapper!.emitted('select')?.[0]?.[0]).toMatchObject({file_id: 3})
	})

	it('explains an empty filtered result and clears the filters', async () => {
		sdk.driveList.mockResolvedValue({data: {files: [], total: 0, bytes: 0, categories: []}})
		mountBrowser()
		await flushPromises()
		expect(wrapper!.text()).toContain('No files here. Upload a file or change your filters.')

		await wrapper!.find('input[type=search]').setValue('nothing')
		await flushPromises()
		expect(wrapper!.text()).toContain('No files match these filters.')
		await buttonsNamed('Clear filters')[0].trigger('click')
		expect((wrapper!.find('input[type=search]').element as HTMLInputElement).value).toBe('')
	})

	it('pages with a single Next button and remembers the chosen layout', async () => {
		sdk.driveList.mockResolvedValue({data: {
			files: Array.from({length: 60}, (_, index) => file(index + 1)),
			total: 61,
			bytes: 0,
			categories: [],
		}})
		mountBrowser()
		await flushPromises()

		expect(wrapper!.text()).toContain('Page 1 of 2')
		expect(buttonsNamed('Next')).toHaveLength(1)
		await buttonsNamed('List')[0].trigger('click')
		expect(wrapper!.find('.drive-files').classes()).toContain('is-list')
		expect(localStorage.getItem('tcymc-drive-view')).toBe('list')
	})
})
