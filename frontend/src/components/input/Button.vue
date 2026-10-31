<template>
	<BaseButton
		class="button"
		:class="[
			variantClass,
			{
				'is-loading': showLoading,
				'has-no-shadow': !shadow || variant === 'tertiary',
				'is-danger': danger,
				'is-icon-only': icon && (iconOnly || !$slots.default),
			}
		]"
		:disabled="disabled"
		:aria-disabled="loading || undefined"
		:style="{
			'--button-white-space': wrap ? 'break-spaces' : 'nowrap',
		}"
	>
		<template v-if="icon">
			<Icon
				v-if="iconOnly || !$slots.default"
				:icon="icon"
				:style="{color: iconColor}"
			/>
			<span
				v-else
				class="icon is-small"
			>
				<Icon
					:icon="icon"
					:style="{color: iconColor}"
				/>
			</span>
		</template>
		<span
			v-if="$slots.default"
			:class="{'is-sr-only': iconOnly}"
		>
			<slot />
		</span>
	</BaseButton>
</template>

<script setup lang="ts">
import {computed, type PropType} from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import type {IconProp} from '@fortawesome/fontawesome-svg-core'

export type ButtonTypes = 'primary' | 'secondary' | 'tertiary'

// Runtime prop declaration: with a type-only one, Vue casts absent boolean props
// to false, so `shadow` and `wrap` would default to false instead of true.
// Combining IconProp with withDefaults blows up the type checker (TS2590).
const props = defineProps({
	variant: {type: String as PropType<ButtonTypes>, default: 'primary'},
	icon: {type: [String, Array, Object] as PropType<IconProp>, default: undefined},
	iconColor: {type: String, default: undefined},
	iconOnly: {type: Boolean, default: false},
	loading: {type: Boolean, default: false},
	disabled: {type: Boolean, default: false},
	shadow: {type: Boolean, default: true},
	wrap: {type: Boolean, default: true},
	danger: {type: Boolean, default: false},
})

defineOptions({name: 'XButton'})

const VARIANT_CLASS_MAP: Record<ButtonTypes, string> = {
	primary: 'is-primary',
	secondary: 'is-outlined',
	tertiary: 'is-text is-inverted underline-none',
}

const variantClass = computed<string>(() => VARIANT_CLASS_MAP[props.variant])
const showLoading = useDelayedLoading(() => props.loading)
</script>

<style lang="scss" scoped>
.button {
	// Button text must stay white regardless of theme, so we use a fixed value
	// instead of var(--white) which changes in dark mode.
	--button-text-color: #ffffff;
	--button-background: var(--primary);
	--button-background-hover: hsl(var(--primary-h), var(--primary-s), calc(var(--primary-l) - 7%));

	// Base structure (replaces Bulma's .button)
	display: inline-flex;
	align-items: center;
	justify-content: center;
	vertical-align: top;
	cursor: pointer;
	text-align: center;
	white-space: var(--button-white-space);

	transition:
		background-color var(--motion-fast) var(--ease-standard),
		border-color var(--motion-fast) var(--ease-standard),
		color var(--motion-fast) var(--ease-standard),
		box-shadow var(--motion-fast) var(--ease-standard),
		transform var(--motion-fast) var(--ease-standard);
	border: 1px solid transparent;
	text-transform: none;
	font-size: var(--text-md);
	font-weight: var(--weight-semibold);
	letter-spacing: .005em;
	block-size: auto;
	min-block-size: var(--control-height);
	box-shadow: var(--elevation-1);
	line-height: 1.2;
	padding-block: .25rem;
	padding-inline: .7rem;
	gap: .375rem;

	&.is-icon-only {
		gap: 0;
		min-inline-size: var(--control-height);
		padding-inline: .4rem;
	}

	> svg {
		display: block;
		flex-shrink: 0;
	}

	// Default/Primary variant colors
	background-color: var(--button-background);
	color: var(--button-text-color);
	border-radius: $radius;

	&:active:not([disabled], [aria-disabled="true"]) {
		transform: scale(.97);
	}

	[dir="rtl"] & {
		flex-direction: row-reverse;
	}

	&:hover {
		background-color: var(--button-background-hover);
	}

	// Mouse clicks keep focus without a ring; keyboard focus always shows one.
	&:focus-visible {
		outline: 2px solid var(--focus-ring-color);
		outline-offset: 2px;
	}

	&[disabled],
	&[aria-disabled='true'] {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}

	.icon {
		margin: 0 !important;
	}

	// Primary variant (default, explicit)
	&.is-primary {
		background-color: var(--button-background);
		color: var(--button-text-color);

		&:hover {
			background-color: var(--button-background-hover);
		}
	}

	// Secondary/Outlined variant: surface with a hairline border
	&.is-outlined {
		background-color: var(--surface);
		border-color: var(--border-default);
		color: var(--text-primary);

		&:hover {
			background-image: linear-gradient(var(--surface-hover), var(--surface-hover));
			border-color: var(--border-strong);
			color: var(--text-primary);
		}
	}

	// Tertiary/Text variant
	&.is-text {
		background-color: transparent;
		color: var(--text-secondary);
		box-shadow: none;

		&:hover {
			background-color: var(--surface-hover);
			color: var(--text-primary);
			box-shadow: none;
		}
	}

	&.is-inverted {
		// Used with is-text for tertiary buttons
		color: inherit;
	}

	// Danger modifier - solid filled button (default and primary variant).
	// --danger itself is too light for white text, so the fill is a deeper red.
	&.is-danger {
		--button-background: hsl(var(--danger-h), 72%, 47%);
		--button-background-hover: hsl(var(--danger-h), 72%, 41%);
		background-color: var(--button-background);
		border-color: transparent;
		color: var(--button-text-color);

		&:hover,
		&:active {
			background-color: var(--button-background-hover);
			border-color: transparent;
		}

		&:focus-visible {
			outline-color: hsla(var(--danger-h), var(--danger-s), var(--danger-l), .7);
		}
	}

	// Danger + outlined/secondary variant
	&.is-danger.is-outlined {
		background-color: var(--surface);
		border: 1px solid hsla(var(--danger-h), var(--danger-s), var(--danger-l), .55);
		color: var(--danger-text);

		&:hover,
		&:focus-visible {
			background-image: none;
			background-color: var(--button-background);
			border-color: var(--button-background);
			color: var(--button-text-color);
		}
	}

	// Danger + text/tertiary variant
	&.is-danger.is-text {
		background-color: transparent;
		color: var(--danger-text);

		&:hover {
			background-color: var(--tint-danger);
		}
	}

	// Danger loading spinner - white on solid, danger-colored on outlined/text
	&.is-danger.is-loading::after {
		border-color: transparent transparent var(--button-text-color) var(--button-text-color);
	}

	&.is-danger.is-outlined.is-loading::after,
	&.is-danger.is-text.is-loading::after {
		border-color: transparent transparent var(--danger) var(--danger);
	}

	// Loading state
	&.is-loading {
		color: transparent !important;
		pointer-events: none;
		position: relative;

		&::after {
			content: "";
			position: absolute;
			display: block;
			block-size: 1em;
			inline-size: 1em;
			border: 2px solid var(--button-text-color);
			border-radius: 50%;
			border-inline-end-color: transparent;
			border-block-start-color: transparent;
			animation: spin-around 500ms infinite linear;

			// Center the spinner
			inset-inline-start: calc(50% - 0.5em);
			inset-block-start: calc(50% - 0.5em);
		}
	}

	&.is-outlined.is-loading::after,
	&.is-text.is-loading::after {
		border-color: var(--grey-700);
		border-inline-end-color: transparent;
		border-block-start-color: transparent;
	}

	&.is-small {
		min-block-size: var(--control-height-sm);
		font-size: var(--text-sm);
		padding-inline: .5rem;
	}
}

@keyframes spin-around {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.underline-none {
	text-decoration: none !important;
}
</style>
