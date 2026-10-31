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
	min-block-size: 2rem;
	padding: .2rem .7rem;
	border: 1px solid var(--border-default);
	border-radius: var(--radius-full);
	background: var(--surface);
	color: var(--text-secondary);
	font: inherit;
	font-size: var(--text-sm);
	font-weight: var(--weight-medium);
	line-height: 1.2;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color var(--motion-fast) var(--ease-standard),
		border-color var(--motion-fast) var(--ease-standard),
		color var(--motion-fast) var(--ease-standard);

	&:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
		background-image: linear-gradient(var(--surface-hover), var(--surface-hover));
	}

	&.is-selected {
		border-color: hsla(var(--primary-hsl), .5);
		background: var(--surface-selected);
		color: var(--accent-text);
		font-weight: var(--weight-semibold);
	}

	@media (pointer: coarse) {
		min-block-size: var(--target-min);
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
	background: var(--surface-active);
	color: var(--text-tertiary);
	font-size: var(--text-xs);
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	text-align: center;

	.is-selected & {
		background: var(--surface-selected-strong);
		color: inherit;
	}
}
</style>
