<template>
	<div
		ref="root"
		class="segmented-control"
		role="group"
		:aria-label="label"
	>
		<button
			v-for="(option, index) in options"
			:key="option.value"
			type="button"
			class="segment"
			:class="{'is-selected': option.value === modelValue}"
			:aria-pressed="option.value === modelValue"
			:data-value="option.value"
			@click="emit('update:modelValue', option.value)"
			@keydown="moveFocus($event, index)"
		>
			<Icon
				v-if="option.icon"
				:icon="option.icon"
				class="segment-icon"
			/>
			<span class="segment-label">{{ option.label }}</span>
			<span
				v-if="option.count !== undefined"
				class="segment-count"
			>{{ option.count }}</span>
		</button>
	</div>
</template>

<script setup lang="ts" generic="T extends string">
import {ref} from 'vue'
import type {IconProp} from '@fortawesome/fontawesome-svg-core'

import Icon from '@/components/misc/Icon'

export interface SegmentedOption<V extends string = string> {
	value: V
	label: string
	count?: number
	icon?: IconProp
}

defineProps<{
	modelValue: T
	options: SegmentedOption<T>[]
	label: string
}>()

const emit = defineEmits<{
	'update:modelValue': [value: T]
}>()

const root = ref<HTMLElement | null>(null)

// Arrow keys move focus only; selection stays an explicit click/Enter/Space so
// that browsing the options never fires a query per keystroke.
function moveFocus(event: KeyboardEvent, index: number) {
	const buttons = Array.from(root.value?.querySelectorAll<HTMLButtonElement>('.segment') ?? [])
	if (buttons.length === 0) return
	const rtl = getComputedStyle(root.value as HTMLElement).direction === 'rtl'
	const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
	const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
	let next: number
	switch (event.key) {
		case forward:
			next = (index + 1) % buttons.length
			break
		case backward:
			next = (index - 1 + buttons.length) % buttons.length
			break
		case 'Home':
			next = 0
			break
		case 'End':
			next = buttons.length - 1
			break
		default:
			return
	}
	event.preventDefault()
	buttons[next].focus()
}
</script>

<style lang="scss" scoped>
.segmented-control {
	display: flex;
	flex-wrap: wrap;
	gap: .375rem;
	min-inline-size: 0;
}

.segment {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: .375rem;
	min-block-size: 2.25rem;
	padding: .25rem .75rem;
	border: 1px solid var(--grey-200);
	border-radius: 999px;
	background: var(--white);
	color: var(--text);
	font: inherit;
	font-size: .875rem;
	line-height: 1.2;
	white-space: nowrap;
	cursor: pointer;
	transition: background-color $transition-duration ease, border-color $transition-duration ease, color $transition-duration ease;

	&:hover {
		border-color: var(--grey-300);
		background: var(--grey-50);
	}

	&.is-selected {
		border-color: hsla(var(--primary-hsl), .45);
		background: hsla(var(--primary-hsl), .1);
		// Plain primary on its own tint is ~4:1; mixing toward the strong text colour
		// darkens it in light mode and lightens it in dark mode.
		color: color-mix(in srgb, var(--primary) 70%, var(--text-strong));
		font-weight: 600;
	}

	@media (pointer: coarse) {
		min-block-size: 2.75rem;
	}

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}
}

.segment-icon {
	inline-size: .875rem;
	block-size: .875rem;
	flex-shrink: 0;
}

.segment-count {
	min-inline-size: 1.25rem;
	padding: 0 .375rem;
	border-radius: 999px;
	background: var(--grey-100);
	color: var(--text-muted);
	font-size: .75rem;
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	text-align: center;

	.is-selected & {
		background: hsla(var(--primary-hsl), .15);
		color: inherit;
	}
}
</style>
