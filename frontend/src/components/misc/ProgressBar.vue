<template>
	<progress
		class="progress-bar"
		:class="{
			'is-small': isSmall,
			'is-primary': isPrimary,
		}"
		:value="value"
		:aria-label="label || undefined"
		max="100"
	>
		{{ value === undefined ? '' : `${value}%` }}
	</progress>
</template>

<script setup lang="ts">
// an omitted value renders the browser's indeterminate bar
withDefaults(defineProps<{
	value?: number
	isSmall?: boolean
	isPrimary?: boolean
	// Accessible name; an aria-label attribute passed by the caller works as well.
	label?: string
}>(), {
	value: undefined,
	isSmall: false,
	isPrimary: false,
	label: '',
})
</script>

<style lang="scss" scoped>
.progress-bar {
	--progress-height: .5rem;
	--progress-bar-background-color: var(--surface-active);
	--progress-value-background-color: var(--text-tertiary);
	--progress-border-radius: var(--radius-full);
	--progress-indeterminate-duration: 1.5s;

	appearance: none;
	border: none;
	border-radius: var(--progress-border-radius);
	block-size: var(--progress-height);
	overflow: hidden;
	padding: 0;
	min-inline-size: 6vw;

	inline-size: 50px;
	margin: 0 var(--space-2) 0 0;
	flex: 3 1 auto;

	&::-moz-progress-bar,
	&::-webkit-progress-value {
		background: var(--progress-value-background-color);
	}

	@media screen and (max-width: $tablet) {
		margin: var(--space-2) 0 0;
		order: 1;
		inline-size: 100%;
	}

	&::-webkit-progress-bar {
		background-color: var(--progress-bar-background-color);
	}

	&::-webkit-progress-value {
		background-color: var(--progress-value-background-color);
		border-radius: var(--progress-border-radius);
	}

	&::-moz-progress-bar {
		background-color: var(--progress-value-background-color);
		border-radius: var(--progress-border-radius);
	}

	&::-ms-fill {
		background-color: var(--progress-value-background-color);
		border: none;
	}

	// Colors
	@each $name, $pair in $colors {
		// stylelint-disable-next-line function-no-unknown
		$color: nth($pair, 1);
		&.is-#{$name} {
			--progress-value-background-color: var(--#{$name}, #{$color});
		}
	}

	&:indeterminate {
		animation-duration: var(--progress-indeterminate-duration);
		animation-iteration-count: infinite;
		animation-name: move-indeterminate;
		animation-timing-function: linear;
		background-color: var(--progress-bar-background-color);
		background-image: linear-gradient(
			to right,
			var(--progress-value-background-color) 30%,
			var(--progress-bar-background-color) 30%
		);
		background-position: top left;
		background-repeat: no-repeat;
		background-size: 150% 150%;

		&::-webkit-progress-bar {
			background-color: transparent;
		}

		&::-moz-progress-bar {
			background-color: transparent;
		}

		&::-ms-fill {
			animation-name: none;
		}

		// A static hatch still reads as "working, amount unknown" without a moving sweep.
		@media (prefers-reduced-motion: reduce) {
			animation: none;
			background-size: auto;
			background-image: repeating-linear-gradient(
				-45deg,
				var(--progress-value-background-color) 0 .25rem,
				var(--progress-bar-background-color) .25rem .5rem
			);
		}
	}

	&.is-small {
		--progress-height: .375rem;
	}
}

@keyframes move-indeterminate {
	from {
		background-position: 200% 0;
	}
	to {
		background-position: -200% 0;
	}
}
</style>
