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
