import {createPinia} from 'pinia'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'
import {defineComponent, reactive, ref} from 'vue'
import {enableAutoUnmount, flushPromises, shallowMount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'

const sdk = vi.hoisted(() => ({
	tasksList: vi.fn(async (_request: {query: Record<string, unknown>}) => ({
		data: {items: [], total_pages: 1},
	})),
}))

vi.mock('@/client/generated', () => sdk)

const auth = reactive({
	authenticated: true,
	settings: {frontend_settings: {filter_id_used_on_overview: undefined, sidebar_width: 250}},
})

vi.mock('@/stores/auth', () => ({useAuthStore: () => auth}))
vi.mock('@/composables/useProjects', () => ({useProjects: () => ({projects: {}})}))
vi.mock('@/composables/useLabels', () => ({useLabels: () => ({getLabelById: vi.fn()})}))
vi.mock('@/helpers/setTitle', () => ({setTitle: vi.fn()}))
vi.mock('vue-i18n', async importOriginal => ({
	...await importOriginal<typeof import('vue-i18n')>(),
	useI18n: () => ({t: (key: string) => key, locale: ref('en')}),
}))

import ShowTasks from './ShowTasks.vue'

enableAutoUnmount(afterEach)

const SlotStub = defineComponent({template: '<div><slot /></div>'})

async function mountUpcoming(stubs: Record<string, unknown> = {}) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{path: '/', component: {render: () => null}}],
	})
	await router.push('/')
	return shallowMount(ShowTasks, {
		props: {
			dateFrom: 'now/d',
			dateTo: 'now/d+1d',
		},
		global: {
			plugins: [
				createPinia(),
				router,
				[VueQueryPlugin, {queryClient: new QueryClient({defaultOptions: {queries: {staleTime: 0, retry: false}}})}],
			],
			mocks: {$t: (key: string) => key},
			stubs: {
				Card: true,
				XButton: true,
				'i18n-t': true,
				DatepickerWithRange: {render: () => null},
				...stubs,
			},
			directives: {tooltip: () => {}, cy: () => {}},
		},
	})
}

function lastQuery(): Record<string, unknown> {
	return sdk.tasksList.mock.lastCall![0].query
}

describe('Upcoming filters', () => {
	beforeEach(() => sdk.tasksList.mockClear())

	it('reloads tasks when overdue tasks are enabled and disabled', async () => {
		const wrapper = await mountUpcoming()
		await flushPromises()
		expect(sdk.tasksList).toHaveBeenCalledTimes(1)
		expect(lastQuery().filter).toBe("done = false && due_date < 'now/d+1d' && due_date > 'now/d'")

		await wrapper.setProps({showOverdue: true})
		await flushPromises()
		expect(sdk.tasksList).toHaveBeenCalledTimes(2)
		expect(lastQuery().filter).toBe("done = false && due_date < 'now/d+1d'")

		await wrapper.setProps({showOverdue: false})
		await flushPromises()
		expect(sdk.tasksList).toHaveBeenCalledTimes(3)
		expect(lastQuery().filter).toBe("done = false && due_date < 'now/d+1d' && due_date > 'now/d'")
	})

	it('reloads tasks when undated tasks are enabled and disabled', async () => {
		const wrapper = await mountUpcoming()
		await flushPromises()

		await wrapper.setProps({showNulls: true})
		await flushPromises()
		expect(sdk.tasksList).toHaveBeenCalledTimes(2)
		expect(lastQuery().filter_include_nulls).toBe(true)

		await wrapper.setProps({showNulls: false})
		await flushPromises()
		expect(sdk.tasksList).toHaveBeenCalledTimes(3)
		expect(lastQuery().filter_include_nulls).toBe(false)
	})

	it('does not reload tasks when sidebar settings change', async () => {
		await mountUpcoming()
		await flushPromises()

		auth.settings = {frontend_settings: {filter_id_used_on_overview: undefined, sidebar_width: 300}}
		await flushPromises()
		expect(sdk.tasksList).toHaveBeenCalledTimes(1)
	})
})

describe('Upcoming grouping', () => {
	beforeEach(() => sdk.tasksList.mockClear())

	it('groups tasks by calendar day with undated tasks last', async () => {
		const now = new Date()
		const utcNoon = (offset: number) => new Date(Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() + offset,
			12,
		)).toISOString()
		sdk.tasksList.mockResolvedValueOnce({data: {
			items: [
				{id: 4, project_id: 1, title: 'Undated', due_date: null},
				{id: 1, project_id: 1, title: 'Today', due_date: utcNoon(0)},
				{id: 2, project_id: 1, title: 'Tomorrow', due_date: utcNoon(1)},
				{id: 3, project_id: 1, title: 'Later', due_date: utcNoon(3)},
			],
			total_pages: 1,
		}} as never)

		const wrapper = await mountUpcoming({Card: SlotStub})
		await flushPromises()

		expect(wrapper.findAll('.task-group').map(group => group.attributes('data-group'))).toEqual([
			'today',
			'tomorrow',
			utcNoon(3).slice(0, 10),
			'none',
		])
	})
})
