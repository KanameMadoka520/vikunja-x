<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import AronaAvatar from './AronaAvatar.vue'
import {welcomeSuggestions, type WelcomeSuggestion} from './welcomeSuggestions'

defineProps<{
	needsSetup: boolean,
	disabled?: boolean,
}>()
const emit = defineEmits<{choose: [suggestion: WelcomeSuggestion]}>()
const {t} = useI18n({useScope: 'global'})
</script>

<template>
	<div
		class="welcome"
		:class="{'needs-setup': needsSetup}"
	>
		<div class="welcome-intro">
			<AronaAvatar class="welcome-avatar" />
			<div class="welcome-text">
				<h2>{{ t('tcymc.text.start_with_a_sentence') }}</h2>
				<p>{{ t('assistantUI.welcomeIntro') }}</p>
			</div>
		</div>
		<div
			v-if="needsSetup"
			class="setup-note"
		>
			<p>{{ t('tcymc.text.add_a_connection_in_ai_and_voice_settings') }}</p>
			<RouterLink
				class="setup-link"
				to="/user/settings/ai"
			>
				<Icon icon="cog" />{{ t('tcymc.text.ai_and_voice_settings') }}
			</RouterLink>
		</div>
		<ul
			v-else
			class="suggestions"
			:aria-label="t('assistantUI.suggestions')"
		>
			<li
				v-for="suggestion in welcomeSuggestions"
				:key="suggestion.id"
			>
				<button
					type="button"
					class="suggestion"
					:disabled="disabled"
					@click="emit('choose', suggestion)"
				>
					<Icon
						:icon="suggestion.icon"
						class="suggestion-icon"
					/>
					<span class="suggestion-label">{{ t(suggestion.label) }}</span>
					<span
						v-if="suggestion.profile"
						class="scenario-tag"
					>{{ t('assistantUI.scenarioTag', {name: t(`assistantUI.presets.${suggestion.profile}.name`)}) }}</span>
				</button>
			</li>
		</ul>
	</div>
</template>

<style scoped lang="scss">
.welcome {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 1.25rem;
	inline-size: min(100%, 34rem);
	min-block-size: 100%;
	margin-inline: auto;
	padding-block: 1.5rem;
}

.welcome-intro {
	display: flex;
	align-items: flex-start;
	gap: .75rem;
}

.welcome-avatar {
	inline-size: 2.5rem;
	block-size: 2.5rem;
}

.welcome-text {
	min-inline-size: 0;
}

h2 {
	margin: 0 0 .25rem;
	color: var(--text-strong);
	font-family: inherit;
	font-size: 1.25rem;
	font-weight: 600;
	line-height: 1.3;
}

p {
	margin: 0;
	color: var(--text-muted);
	font-size: .9rem;
	line-height: 1.55;
}

.suggestions {
	margin: 0;
	padding: 0;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	list-style: none;
}

li + li {
	border-block-start: 1px solid var(--grey-200);
}

.suggestion {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .25rem .65rem;
	inline-size: 100%;
	min-block-size: 44px;
	padding: .6rem .85rem;
	border: 0;
	background: transparent;
	color: var(--text);
	font: inherit;
	font-size: .9rem;
	text-align: start;
	cursor: pointer;
	transition: background-color .15s ease;

	&:hover:not(:disabled) {
		background: var(--grey-100);
	}

	&:disabled {
		opacity: .6;
		cursor: not-allowed;
	}

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}
}

li:first-child .suggestion {
	border-start-start-radius: .75rem;
	border-start-end-radius: .75rem;
}

li:last-child .suggestion {
	border-end-start-radius: .75rem;
	border-end-end-radius: .75rem;
}

.suggestion-icon {
	flex-shrink: 0;
	inline-size: 1rem;
	color: var(--text-muted);
}

.suggestion-label {
	flex: 1 1 10rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.scenario-tag {
	padding: .1rem .5rem;
	border-radius: 999px;
	background: hsla(var(--primary-hsl), .12);
	color: var(--text);
	font-size: .75rem;
	font-weight: 600;
	white-space: nowrap;
}

.setup-note {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: .5rem;
	padding: .85rem 1rem;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	background: var(--grey-100);

	p {
		color: var(--text);
	}
}

.setup-link {
	display: inline-flex;
	align-items: center;
	gap: .45rem;
	min-block-size: 36px;
	font-weight: 600;

	@media (pointer: coarse) {
		min-block-size: 44px;
	}
}

// Short viewports usually mean an open on-screen keyboard: keep only what blocks sending.
@media (height <= 600px) {
	.welcome:not(.needs-setup) {
		display: none;
	}

	.needs-setup .welcome-intro {
		display: none;
	}
}
</style>
