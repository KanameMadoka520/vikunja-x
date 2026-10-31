import {shallowMount} from '@vue/test-utils'
import {describe, expect, it, vi} from 'vitest'
import AgentReviewCard from './AgentReviewCard.vue'

vi.mock('vue-i18n', () => ({
	useI18n: () => ({t: (key: string) => key}),
}))

describe('project completion review', () => {
	it('shows the persisted project state before approval and submits the exact pending operation', async () => {
		const wrapper = shallowMount(AgentReviewCard, {
			props: {
				busy: false,
				turn: {
					id: 'turn-1',
					result: {
						pause: 'review',
						pending: {
							id: 'operation-1',
							tool: 'set_project_completed',
							before: '[{"id":7,"title":"A project","is_completed":false}]',
							arguments: '{"id":7,"completed":true}',
						},
					},
				},
			},
			global: {
				stubs: {
					Icon: true,
					XButton: {template: '<button><slot /></button>'},
				},
			},
		})
		const cells = wrapper.findAll('tbody td').map(cell => cell.text())
		expect(cells).toEqual(['#7 A project', 'agent.fields.completed', 'false', 'true'])
		const approve = wrapper.findAll('button').find(button => button.text() === 'agent.approve')!
		await wrapper.setProps({busy: true})
		await approve.trigger('click')
		expect(wrapper.emitted('review')).toBeUndefined()
		await wrapper.setProps({busy: false})
		await approve.trigger('click')
		expect(wrapper.emitted('review')?.[0]?.[0]).toMatchObject({
			turn_id: 'turn-1',
			operation_id: 'operation-1',
			decision: 'approve',
		})
	})
})

describe('routine check-in review', () => {
	it('compares the requested check-in with today\'s recorded state under a routine label', () => {
		const wrapper = shallowMount(AgentReviewCard, {
			props: {
				busy: false,
				turn: {
					id: 'turn-2',
					result: {
						pause: 'review',
						pending: {
							id: 'operation-2',
							tool: 'check_in_task_routine',
							before: '[{"id":12,"title":"Water the plants","done":false,"routine":{"enabled":true,"completed_today":false,"date":"2026-11-01"}}]',
							arguments: '{"id":12,"date":"2026-11-01","completed":true}',
						},
					},
				},
			},
			global: {
				stubs: {
					Icon: true,
					XButton: {template: '<button><slot /></button>'},
				},
			},
		})
		const rows = wrapper.findAll('tbody tr').map(row => row.findAll('td').map(cell => cell.text()))
		expect(rows).toEqual([
			['#12 Water the plants', 'agent.fields.date', '2026-11-01', '2026-11-01'],
			['#12 Water the plants', 'agent.fields.routine_completed', 'false', 'true'],
		])
	})
})
