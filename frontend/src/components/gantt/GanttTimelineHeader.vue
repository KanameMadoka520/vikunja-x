<template>
	<!-- A visual axis only: every bar announces its own dates, so the 70-odd day cells stay out of the reading order. -->
	<div
		class="gantt-timeline"
		aria-hidden="true"
	>
		<!-- Upper timeunit for months -->
		<div class="gantt-timeline-months">
			<div
				v-for="monthGroup in monthGroups"
				:key="monthGroup.key"
				class="timeunit-month"
				:style="{ width: `${monthGroup.width}px` }"
			>
				<span class="timeunit-month__label">{{ monthGroup.label }}</span>
			</div>
		</div>

		<!-- Lower timeunit for days -->
		<div class="gantt-timeline-days">
			<div
				v-for="date in timelineData"
				:key="date.toISOString()"
				class="timeunit"
				:class="{'is-weekend': isWeekend(date)}"
				:style="{ width: `${dayWidthPixels}px` }"
			>
				<div
					class="timeunit-wrapper"
					:class="{'today': dateIsToday(date)}"
				>
					<span class="timeunit-day">{{ date.getDate() }}</span>
					<span class="weekday">
						{{ weekDayFromDate(date) }}
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {useWeekDayFromDate} from '@/helpers/time/formatDate'
import dayjs from 'dayjs'

const props = defineProps<{
	timelineData: Date[]
	dayWidthPixels: number
}>()

const weekDayFromDate = useWeekDayFromDate()
const {now: today} = useGlobalNow()

const dateIsToday = computed(() => {
	const todayStr = today.value.toDateString()
	return (date: Date) => date.toDateString() === todayStr
})

function isWeekend(date: Date) {
	return date.getDay() === 0 || date.getDay() === 6
}

const monthGroups = computed(() => {
	const groups = props.timelineData.reduce(
		(groups, date) => {
			const month = date.getMonth()
			const year = date.getFullYear()
			const key = `${year}-${month}`

			const lastGroup = groups[groups.length - 1]
			if (lastGroup?.key === key) {
				lastGroup.width += props.dayWidthPixels
			} else {
				groups.push({
					key,
					label: dayjs(date).format('MMMM YYYY'),
					width: props.dayWidthPixels,
				})
			}

			return groups
		},
		[] as Array<{key: string; label: string; width: number}>,
	)

	return groups
})
</script>

<style scoped lang="scss">
.gantt-timeline {
	position: sticky;
	inset-block-start: 0;
	z-index: var(--layer-sticky);
	background: var(--surface);
	box-shadow: inset 0 -1px 0 var(--border-default);
}

.gantt-timeline-months {
	display: flex;
	border-block-end: 1px solid var(--border-subtle);

	.timeunit-month {
		flex-shrink: 0;
		padding: var(--space-1) 0;
		border-inline-end: 1px solid var(--border-subtle);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		white-space: nowrap;
	}
}

// The month name rides along the start edge while its month scrolls past.
.timeunit-month__label {
	display: inline-block;
	position: sticky;
	inset-inline-start: 0;
	padding-inline: var(--space-2);
}

.gantt-timeline-days {
	display: flex;

	.timeunit {
		flex-shrink: 0;

		&.is-weekend {
			background: var(--surface-hover);
		}
	}

	.timeunit-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		inline-size: 100%;
		padding: var(--space-1) 0;
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		line-height: var(--leading-tight);

		&.today {
			border-radius: var(--radius-sm) var(--radius-sm) 0 0;
			background: var(--surface-selected-strong);
			box-shadow: inset 0 -2px 0 var(--primary);
			color: var(--accent-text);
			font-weight: var(--weight-semibold);

			.weekday {
				color: var(--accent-text);
			}
		}
	}

	.weekday {
		color: var(--text-tertiary);
		font-size: var(--text-2xs);
	}
}
</style>
