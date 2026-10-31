<template>
	<BaseCheckbox
		class="fancy-checkbox"
		:class="{
			'is-disabled': disabled,
			'is-block': isBlock,
		}"
		:disabled="disabled"
		:model-value="modelValue"
		:aria-label="ariaLabel"
		@update:modelValue="value => emit('update:modelValue', value)"
	>
		<CheckboxIcon
			class="fancy-checkbox__icon"
			aria-hidden="true"
		/>
		<span
			v-if="$slots.default"
			class="fancy-checkbox__content"
		>
			<slot />
		</span>
	</BaseCheckbox>
</template>

<script setup lang="ts">
import CheckboxIcon from '@/assets/checkbox.svg?component'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'

withDefaults(defineProps<{
	modelValue: boolean,
	disabled?: boolean,
	isBlock?: boolean,
	ariaLabel?: string,
}>(), {
	disabled: false,
	isBlock: false,
	ariaLabel: undefined,
})

const emit = defineEmits<{
	'update:modelValue': [value: boolean]
}>()
</script>

<style lang="scss" scoped>
.fancy-checkbox {
	display: inline-block;
	padding-inline-end: 5px;
	padding-block-start: 3px;

	&.is-block {
		display: block;
		margin: var(--space-2) .2rem;
	}
}

.fancy-checkbox :deep(.base-checkbox__label) {
	align-items: center;
	// The label itself is the target, so its size is real layout: an invisible overlay would sit on
	// top of the text and reach into neighbouring rows. Call sites that need more override these.
	min-block-size: var(--target-min);
	min-inline-size: var(--target-min);
}

.fancy-checkbox__content {
	font-size: var(--text-md);
	vertical-align: top;
	padding-inline-start: var(--space-2);
}

.fancy-checkbox__icon:deep() {
	position: relative;
	z-index: 1;
	flex-shrink: 0;
	// The unchecked box is the only boundary of the control, so it needs 3:1 against the surface.
	stroke: var(--stroke-color, var(--text-tertiary));
	transition: stroke var(--motion-fast) var(--ease-standard);

	path,
	polyline {
		transition: stroke-dashoffset var(--motion-base) var(--ease-standard);
	}
}

.fancy-checkbox:hover input:not(:disabled) + .fancy-checkbox__icon,
.fancy-checkbox input:checked + .fancy-checkbox__icon {
	--stroke-color: var(--primary);
}

.fancy-checkbox.is-disabled .fancy-checkbox__icon {
	opacity: .5;
}

.fancy-checkbox input:focus-visible + .fancy-checkbox__icon {
	border-radius: var(--radius-sm);
	@include focus-ring;
}

@supports not selector(:focus-visible) {
	.fancy-checkbox input:focus + .fancy-checkbox__icon {
		border-radius: var(--radius-sm);
		@include focus-ring;
	}
}
</style>

<style lang="scss">
// Since css-has-pseudo doesn't work with deep classes,
// the following rules can't be scoped

.fancy-checkbox input:checked + .fancy-checkbox__icon {
	path {
		stroke-dashoffset: 60;
	}

	polyline {
		stroke-dashoffset: 42;
	}
}

// The tick draws after the box fades; without motion both change at once.
@media (prefers-reduced-motion: no-preference) {
	.fancy-checkbox :not(input:checked) + .fancy-checkbox__icon path {
		transition-delay: 50ms;
	}

	.fancy-checkbox input:checked + .fancy-checkbox__icon polyline {
		transition-delay: 120ms;
	}
}
</style>
