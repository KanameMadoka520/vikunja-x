import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createMemoryHistory, createRouter} from 'vue-router'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'

import type {ProjectTimelineQuery} from '@/client/queries/projectTimeline'

const sdk = vi.hoisted(() => ({
	projectTimeline: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/composables/useProjects', () => ({
	useProjects: () => ({projectsArray: []}),
}))

import ProjectTimelineView from './ProjectTimelineView.vue'
import {invalidateTaskMembership} from '@/client/queries/taskCache'
import enMessages from '@/i18n/lang/en.json'

const i18n = createI18n({legacy: false, locale: 'en', messages: {en: enMessages}})

function timeline(query: ProjectTimelineQuery, progress: number) {
	return {
		data: {
			year: query.year,
			today: '2026-10-31',
			first_year: 2026,
			last_year: 2026,
			days: {'2026-02-05': {scheduled_projects: 1, elapsed_projects: 1, deadlines: 0}},
			projects: 1,
			scheduled_days: 10,
			elapsed_days: 10,
			dated_tasks: 2,
			done_tasks: 1,
			overdue_tasks: 0,
			excluded_tasks: 3,
			invalid_tasks: 0,
			items: [{
				id: 1,
				title: 'Website relaunch',
				hex_color: '1973ff',
				start_date: '2026-02-01',
				end_date: '2026-02-10',
				scheduled_days: 10,
				elapsed_days: 10,
				task_count: 2,
				done_tasks: 1,
				progress,
				scheduled_spans: [{start: '2026-02-01', end: '2026-02-10'}],
				elapsed_spans: [{start: '2026-02-01', end: '2026-02-10'}],
			}],
			total: 1,
			page: 1,
			total_pages: 1,
		},
	}
}

let wrapper: VueWrapper | undefined
let client: QueryClient
let router: ReturnType<typeof createRouter>

async function mountView(path = '/projects/history') {
	router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{path: '/projects/history', name: 'projects.history', component: {template: '<div />'}},
			{path: '/projects/:projectId', name: 'project.index', component: {template: '<div />'}},
		],
	})
	await router.push(path)
	await router.isReady()
	client = new QueryClient({defaultOptions: {queries: {retry: false}}})
	wrapper = mount(ProjectTimelineView, {
		attachTo: document.body,
		props: {year: 2026, timezone: 'UTC'},
		global: {
			plugins: [i18n, router, [VueQueryPlugin, {queryClient: client}]],
			stubs: {
				Icon: true,
				XButton: {template: '<button type="button"><slot /></button>'},
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('ProjectTimelineView', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		document.body.innerHTML = ''
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = undefined
	})

	it('explains progress, elapsed time and missing dates separately', async () => {
		sdk.projectTimeline.mockImplementation(async ({query}) => timeline(query, 0.5))
		const view = await mountView()
		expect(view.find('.lane [role="progressbar"]').attributes('aria-valuenow')).toBe('50')
		expect(view.find('.lane').text()).toContain('10 of 10 scheduled days in 2026 counted as passed')
		expect(view.find('.timeline-missing').text()).toContain('3 tasks are not on the timeline')
		expect(view.findAll('.timeline-stat dd').map(dd => dd.text())).toEqual(['1', '10 days', '10 days', '1 of 2', '0'])
		expect(view.emitted('years')).toEqual([[[2026]]])
	})

	it('keeps lanes, the search draft and focus while a task change refreshes it in the background', async () => {
		sdk.projectTimeline.mockImplementation(async ({query}) => timeline(query, 0.5))
		const view = await mountView()
		expect(sdk.projectTimeline).toHaveBeenCalledTimes(1)

		const search = view.get<HTMLInputElement>('.timeline-search input')
		search.element.focus()
		await search.setValue('Web')

		let release!: () => void
		sdk.projectTimeline.mockImplementation(async ({query}) => {
			await new Promise<void>(resolve => {
				release = resolve
			})
			return timeline(query, 1)
		})
		void invalidateTaskMembership(client, 1)
		await flushPromises()

		// Mid-refresh: still the old content, at full contrast, nothing replaced by a skeleton.
		expect(sdk.projectTimeline).toHaveBeenCalledTimes(2)
		expect(view.find('.timeline-skeleton').exists()).toBe(false)
		expect(view.find('.is-refreshing').exists()).toBe(false)
		expect(view.find('.lane').text()).toContain('50% average progress')
		expect(search.element.value).toBe('Web')
		expect(document.activeElement).toBe(search.element)

		release()
		await flushPromises()
		expect(view.find('.lane').text()).toContain('100% average progress')
		expect(search.element.value).toBe('Web')
		expect(document.activeElement).toBe(search.element)
		expect(sdk.projectTimeline).toHaveBeenCalledTimes(2)
	})

	it('keeps the lanes heading on the year while a month is only zoomed', async () => {
		sdk.projectTimeline.mockImplementation(async ({query}) => timeline(query, 0.5))
		const view = await mountView('/projects/history?month=3')
		expect(sdk.projectTimeline.mock.lastCall?.[0].query).not.toHaveProperty('month')
		expect(view.get('#timeline-projects-heading').text()).toBe('Projects with scheduled work in 2026')
		expect(view.find('.lane').text()).toContain('Nothing scheduled in March')
	})

	it('names the single year that has scheduled work instead of a one-year range', async () => {
		sdk.projectTimeline.mockImplementation(async ({query}) => {
			const response = timeline(query, 0)
			return {data: {...response.data, first_year: 2024, last_year: 2024, items: [], total: 0, dated_tasks: 0}}
		})
		const view = await mountView()
		expect(view.text()).toContain('No scheduled work in 2026.')
		expect(view.text()).toContain('Scheduled tasks exist only in 2024.')
		expect(view.text()).not.toContain('between 2024 and 2024')
	})

	it('drops a pending search when the view unmounts', async () => {
		sdk.projectTimeline.mockImplementation(async ({query}) => timeline(query, 0.5))
		const view = await mountView()
		const replace = vi.spyOn(router, 'replace')
		await view.get('.timeline-search input').setValue('Web')
		view.unmount()
		wrapper = undefined
		await new Promise(resolve => setTimeout(resolve, 350))
		expect(replace).not.toHaveBeenCalled()
	})

	it('applies the search after typing stops', async () => {
		sdk.projectTimeline.mockImplementation(async ({query}) => timeline(query, 0.5))
		const view = await mountView()
		await view.get('.timeline-search input').setValue('Web')
		await vi.waitFor(() => expect(router.currentRoute.value.query.q).toBe('Web'))
	})

	it('offers a retry when the first load fails', async () => {
		sdk.projectTimeline.mockRejectedValueOnce(new Error('offline'))
		const view = await mountView()
		expect(view.find('[role="alert"]').text()).toContain('Could not load the timeline.')
		sdk.projectTimeline.mockImplementation(async ({query}) => timeline(query, 0.5))
		await view.get('[role="alert"] button').trigger('click')
		await flushPromises()
		expect(view.find('.lane').exists()).toBe(true)
	})
})
