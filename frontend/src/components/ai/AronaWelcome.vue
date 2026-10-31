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
	gap: var(--space-4);
	inline-size: min(100%, 34rem);
	min-block-size: 100%;
	margin-inline: auto;
	padding-block: var(--space-6);
}

.welcome-intro {
	display: flex;
	align-items: flex-start;
	gap: var(--space-3);
}

.welcome-avatar {
	inline-size: 2.5rem;
	block-size: 2.5rem;
}

.welcome-text {
	min-inline-size: 0;
}

h2 {
	margin: 0 0 var(--space-1);
	color: var(--text-primary);
	font-size: var(--text-xl);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
}

p {
	margin: 0;
	color: var(--text-secondary);
	font-size: var(--text-md);
	line-height: var(--leading-normal);
}

.suggestions {
	margin: 0;
	padding: 0;
	overflow: hidden;
	border: 1px solid var(--border-default);
	border-radius: var(--radius-md);
	background: var(--surface);
	list-style: none;
}

li + li {
	border-block-start: 1px solid var(--border-subtle);
}

.suggestion {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-3);
	inline-size: 100%;
	min-block-size: var(--control-height-lg);
	padding: var(--space-2) var(--space-3);
	border: 0;
	background: transparent;
	color: var(--text-primary);
	font: inherit;
	font-size: var(--text-md);
	text-align: start;
	cursor: pointer;

	&:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	&:focus-visible {
		outline: 2px solid var(--focus-ring-color);
		outline-offset: -2px;
	}

	&:disabled {
		opacity: .6;
		cursor: not-allowed;
	}
}

.suggestion-icon {
	flex-shrink: 0;
	inline-size: 1rem;
	color: var(--text-tertiary);
}

.suggestion-label {
	flex: 1 1 10rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.scenario-tag {
	padding: 0 var(--space-2);
	border-radius: var(--radius-full);
	background: var(--surface-selected);
	color: var(--accent-text);
	font-size: var(--text-xs);
	font-weight: var(--weight-semibold);
	line-height: 1.6;
	white-space: nowrap;
}

.setup-note {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--space-2);
	padding: var(--space-3) var(--space-4);
	border: 1px solid var(--border-subtle);
	border-inline-start: 3px solid var(--primary);
	border-radius: var(--radius-md);
	background: var(--tint-info);

	p {
		color: var(--text-primary);
	}
}

.setup-link {
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	min-block-size: var(--control-height);
	font-weight: var(--weight-semibold);
}

// Short viewports (often an open on-screen keyboard): a compact welcome rather than an empty thread.
@media (height <= 600px) {
	.welcome {
		gap: var(--space-2);
		padding-block: var(--space-2);
	}

	.welcome-avatar {
		inline-size: 1.75rem;
		block-size: 1.75rem;
	}

	h2 {
		font-size: var(--text-lg);
	}

	.welcome-text p,
	.suggestions li:nth-child(n + 3) {
		display: none;
	}
}
</style>
