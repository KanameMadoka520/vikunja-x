import {describe, expect, it} from 'vitest'
import {mount, RouterLinkStub} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import enMessages from '@/i18n/lang/en.json'
import AronaWelcome from './AronaWelcome.vue'
import {welcomeSuggestions} from './welcomeSuggestions'

const i18n = createI18n({legacy: false, locale: 'en', messages: {en: enMessages}})

function mountWelcome(props: {needsSetup: boolean, disabled?: boolean}) {
	return mount(AronaWelcome, {
		props,
		global: {
			plugins: [i18n],
			stubs: {
				Icon: true,
				RouterLink: RouterLinkStub,
			},
		},
	})
}

describe('AronaWelcome', () => {
	it('names the scenario only on suggestions that need one', () => {
		const buttons = mountWelcome({needsSetup: false}).findAll('.suggestions button')
		expect(buttons).toHaveLength(welcomeSuggestions.length)
		buttons.forEach((button, index) => {
			const tag = button.find('.scenario-tag')
			if (welcomeSuggestions[index].profile) expect(tag.text()).toBe('Scenario: Plan & review')
			else expect(tag.exists()).toBe(false)
		})
	})

	it('emits the chosen suggestion', async () => {
		const wrapper = mountWelcome({needsSetup: false})
		await wrapper.findAll('.suggestions button')[2].trigger('click')
		expect(wrapper.emitted('choose')).toEqual([[welcomeSuggestions[2]]])
	})

	it('keeps suggestions inert until the composer options are ready', async () => {
		const wrapper = mountWelcome({needsSetup: false, disabled: true})
		const button = wrapper.find('.suggestions button')
		expect(button.attributes('disabled')).toBeDefined()
		await button.trigger('click')
		expect(wrapper.emitted('choose')).toBeUndefined()
	})

	it('replaces suggestions with the setup link when no model is configured', () => {
		const wrapper = mountWelcome({needsSetup: true})
		expect(wrapper.find('.suggestions').exists()).toBe(false)
		expect(wrapper.find('.setup-note').text()).toContain('Add a connection in AI and voice settings')
		expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/user/settings/ai')
	})
})
