import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
	defineComponent,
	h,
	onMounted,
	reactive,
	resolveDynamicComponent,
	type VNode,
} from 'vue'
import {enableAutoUnmount, flushPromises, mount, type VueWrapper} from '@vue/test-utils'

const state = vi.hoisted(() => ({route: undefined as unknown}))
vi.mock('vue-router', () => ({
	useRoute: () => state.route,
	useRouter: () => ({
		resolve: (path: string) => ({fullPath: path}),
		push: vi.fn(),
		back: vi.fn(),
	}),
}))
vi.mock('@/stores/base', () => ({useBaseStore: () => ({currentProjectId: 0})}))
vi.mock('@/composables/useProjects', () => ({useProjects: () => ({projects: {}})}))

import {useRouteWithModal} from './useRouteWithModal'

enableAutoUnmount(afterEach)

let mounts = 0
const TaskModal = defineComponent({
	props: {
		taskId: {type: Number, required: true},
		backdropView: {type: String, default: undefined},
	},
	setup() {
		onMounted(() => mounts++)
		return () => h('input', {class: 'draft'})
	},
})

// Like the task.detail record: a lazy loader that vue-router has not swapped for the loaded component.
const loadTaskModal = () => Promise.resolve(TaskModal)

type FakeRoute = {
	fullPath: string,
	hash: string,
	query: Record<string, string>,
	params: Record<string, string>,
	matched: unknown[],
}

function taskRoute(): FakeRoute {
	return reactive({
		fullPath: '/tasks/1',
		hash: '',
		query: {},
		params: {id: '1'},
		matched: [{
			props: {default: (route: FakeRoute) => ({taskId: Number(route.params.id)})},
			components: {default: loadTaskModal},
		}],
	})
}

// vue-router hands out a new route object per navigation, so every key, `matched` included, changes.
function navigate(route: FakeRoute, change: Partial<FakeRoute>) {
	Object.assign(route, change, {matched: [...route.matched]})
}

// Renders the modal the way ContentAuth does with <component :is="currentModal" />.
const Host = defineComponent({
	setup(_props, {expose}) {
		const {currentModal} = useRouteWithModal()
		expose({currentModal})
		return () => h('div', [currentModal.value ? h(resolveDynamicComponent(currentModal.value) as VNode) : null])
	},
})

function modalOf(wrapper: VueWrapper) {
	return (wrapper.vm as unknown as {currentModal: VNode | undefined}).currentModal
}

describe('useRouteWithModal', () => {
	beforeEach(() => {
		mounts = 0
		window.history.replaceState({backdropView: '/projects/1/1'}, '')
	})

	afterEach(() => window.history.replaceState(null, ''))

	it('keeps the open modal mounted when only the hash or query changes', async () => {
		const route = taskRoute()
		state.route = route
		const wrapper = mount(Host)
		await flushPromises()

		const component = modalOf(wrapper)?.type
		expect(mounts).toBe(1)
		await wrapper.find('input.draft').setValue('Unsaved draft')

		navigate(route, {
			fullPath: '/tasks/1#comment-5',
			hash: '#comment-5',
		})
		await flushPromises()
		navigate(route, {
			fullPath: '/tasks/1?view=compact#comment-5',
			query: {view: 'compact'},
		})
		await flushPromises()

		expect(modalOf(wrapper)?.type).toBe(component)
		expect(modalOf(wrapper)?.props?.taskId).toBe(1)
		expect(mounts).toBe(1)
		expect((wrapper.find('input.draft').element as HTMLInputElement).value).toBe('Unsaved draft')
	})

	it('shares the component across hosts that render the same lazy route', async () => {
		state.route = taskRoute()
		const first = mount(Host)
		const second = mount(Host)
		await flushPromises()

		expect(modalOf(first)?.type).toBe(modalOf(second)?.type)
	})
})
