<template>
	<div
		class="date-shortcuts"
		:class="`date-shortcuts--${layout}`"
	>
		<div
			v-if="layout === 'list'"
			class="date-shortcuts__heading"
		>
			{{ $t('input.datepicker.quickSelect') }}
		</div>
		<BaseButton
			v-for="(shortcut, index) in shortcuts"
			:key="shortcut.key"
			:ref="el => shortcutButtons.set(shortcut.key, el as InstanceType<typeof BaseButton> | null)"
			class="datepicker__quick-select-date date-shortcuts__item"
			:class="{'is-active': isSameDay(shortcut.date, active)}"
			@click.stop="emit('select', shortcut.date)"
			@keydown.up.prevent="focusShortcut(index - 1)"
			@keydown.down.prevent="focusShortcut(index + 1)"
			@keydown.enter.prevent="confirmShortcut(shortcut.date)"
		>
			<span class="date-shortcuts__icon">
				<Icon :icon="shortcut.icon" />
			</span>
			<span class="date-shortcuts__label">{{ $t(`input.datepicker.${shortcut.key}`) }}</span>
			<span
				v-if="layout === 'list'"
				class="date-shortcuts__weekday"
			>{{ shortcut.weekday }}</span>
		</BaseButton>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'

import {formatDate} from '@/helpers/time/formatDate'
import {isSameDay} from '@/helpers/time/dateMath'
import {buildDateShortcuts, type DateShortcutKey} from '@/helpers/time/dateShortcuts'
import type {IconProp} from '@fortawesome/fontawesome-svg-core'

withDefaults(defineProps<{
	layout?: 'list' | 'chips'
	active?: Date | null
}>(), {
	layout: 'list',
	active: null,
})

const emit = defineEmits<{
	select: [date: Date]
	confirm: []
}>()

const ICONS: Record<DateShortcutKey, IconProp> = {
	today: ['far', 'calendar-alt'],
	tomorrow: ['far', 'sun'],
	nextMonday: 'coffee',
	thisWeekend: 'cocktail',
	laterThisWeek: 'chess-knight',
	nextWeek: 'forward',
	nextWeekend: 'umbrella-beach',
	endOfMonth: 'flag-checkered',
	inAMonth: 'calendar-plus',
}

const shortcuts = computed(() => buildDateShortcuts().map(shortcut => ({
	...shortcut,
	icon: ICONS[shortcut.key],
	weekday: formatDate(shortcut.date, 'ddd'),
})))
const shortcutButtons = new Map<DateShortcutKey, InstanceType<typeof BaseButton> | null>()

function focusShortcut(index: number) {
	const shortcut = shortcuts.value[index]
	if (shortcut) {
		shortcutButtons.get(shortcut.key)?.focus()
	}
}

function confirmShortcut(date: Date) {
	emit('select', date)
	emit('confirm')
}
</script>

<style lang="scss" scoped>
.date-shortcuts--list {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: var(--space-3) var(--space-2);
	background: var(--surface-sunken);
	border-inline-end: 1px solid var(--border-subtle);
	inline-size: 13rem;
	flex-shrink: 0;

	.date-shortcuts__heading {
		font-size: var(--text-2xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: .05em;
		color: var(--text-tertiary);
		padding: var(--space-1) var(--space-2) var(--space-2);
	}

	.date-shortcuts__item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		inline-size: 100%;
		min-block-size: 2rem;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-md);
		font-weight: var(--weight-medium);
		color: var(--text-primary);
		text-align: start;
		transition: background-color var(--motion-fast) var(--ease-standard);

		&:hover {
			background: var(--surface-hover);
		}

		&.is-active {
			background: var(--surface-selected);
			color: var(--accent-text);
			font-weight: var(--weight-semibold);

			.date-shortcuts__icon {
				color: var(--accent-text);
			}
		}

		@media (pointer: coarse) {
			min-block-size: var(--target-min);
		}
	}

	.date-shortcuts__icon {
		inline-size: 1rem;
		text-align: center;
		font-size: var(--text-sm);
		color: var(--text-tertiary);
	}

	.date-shortcuts__weekday {
		margin-inline-start: auto;
		color: var(--text-tertiary);
		font-weight: var(--weight-regular);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		text-transform: capitalize;
	}
}

.date-shortcuts--chips {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	padding: var(--space-3) var(--space-4);
	border-block-end: 1px solid var(--border-subtle);

	.bottom-sheet & {
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}
	}

	.date-shortcuts__item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--control-height-sm);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);
		background: transparent;
		font-size: var(--text-md);
		font-weight: var(--weight-medium);
		color: var(--text-primary);
		white-space: nowrap;
		transition:
			background-color var(--motion-fast) var(--ease-standard),
			border-color var(--motion-fast) var(--ease-standard),
			color var(--motion-fast) var(--ease-standard);

		&:hover {
			background-color: var(--surface-hover);
		}

		&.is-active {
			background-color: var(--surface-selected-strong);
			border-color: transparent;
			color: var(--accent-text);

			.date-shortcuts__icon {
				opacity: 1;
			}
		}
	}

	.date-shortcuts__icon {
		font-size: var(--text-xs);
		opacity: .7;
	}
}
</style>
