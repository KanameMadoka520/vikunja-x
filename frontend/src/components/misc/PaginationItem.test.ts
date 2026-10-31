import {describe, it, expect} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import PaginationItem from './PaginationItem.vue'

const mountItem = (props: Record<string, unknown>) => mount(PaginationItem, {
	props: {
		variant: 'previous',
		...props,
	},
	slots: {
		default: 'Previous',
	},
	global: {
		stubs: {
			RouterLink: {
				template: '<a :href="typeof to === \'string\' ? to : \'#\'"><slot /></a>',
				props: ['to'],
			},
		},
	},
})

describe('PaginationItem', () => {
	it('renders a link when enabled', () => {
		const wrapper = mountItem({to: '/projects/1/1?page=2'})
		expect(wrapper.find('a').exists()).toBe(true)
	})

	it('does not render a navigable link when disabled', () => {
		const wrapper = mountItem({to: '/projects/1/1?page=0', disabled: true})
		expect(wrapper.find('a').exists()).toBe(false)
	})

	it('marks only the current page with aria-current, although the router ignores the query', async () => {
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{
				path: '/list',
				name: 'list',
				component: {template: '<div />'},
			}],
		})
		await router.push({
			name: 'list',
			query: {page: 2},
		})
		const mountLink = (page: number, isCurrent: boolean) => mount(PaginationItem, {
			props: {
				variant: 'link',
				isCurrent,
				to: {
					name: 'list',
					query: {page},
				},
			},
			slots: {default: String(page)},
			global: {plugins: [router]},
		})

		const current = mountLink(2, true)
		const other = mountLink(3, false)
		await flushPromises()

		expect(current.find('a').attributes('aria-current')).toBe('page')
		expect(other.find('a').attributes('aria-current')).toBe('false')
	})
})
