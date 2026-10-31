<template>
	<div
		class="gantt-grid-lines"
		aria-hidden="true"
	>
		<svg
			class="gantt-vertical-lines"
			:width="totalWidth"
			:height="height"
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect
				v-for="index in weekendIndexes"
				:key="`weekend-${index}`"
				:x="index * dayWidthPixels"
				:y="0"
				:width="dayWidthPixels"
				:height="height"
				fill="var(--surface-hover)"
			/>
			<rect
				v-if="todayIndex >= 0"
				:x="todayIndex * dayWidthPixels"
				:y="0"
				:width="dayWidthPixels"
				:height="height"
				fill="var(--surface-selected)"
			/>
			<line
				v-for="(date, index) in timelineData"
				:key="date.toISOString()"
				:x1="index * dayWidthPixels"
				:y1="0"
				:x2="index * dayWidthPixels"
				:y2="height"
				stroke="var(--border-subtle)"
				stroke-width="1"
			/>
			<line
				v-if="todayIndex >= 0"
				class="gantt-today-line"
				:x1="(todayIndex + .5) * dayWidthPixels"
				:y1="0"
				:x2="(todayIndex + .5) * dayWidthPixels"
				:y2="height"
				stroke="var(--primary)"
				stroke-width="2"
			/>
		</svg>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useGlobalNow} from '@/composables/useGlobalNow'

const props = defineProps<{
	timelineData: Date[]
	totalWidth: number
	height: number
	dayWidthPixels: number
}>()

const {now} = useGlobalNow()

const todayIndex = computed(() => {
	const today = now.value.toDateString()
	return props.timelineData.findIndex(date => date.toDateString() === today)
})

const weekendIndexes = computed(() => props.timelineData
	.map((date, index) => (date.getDay() === 0 || date.getDay() === 6) ? index : -1)
	.filter(index => index >= 0))
</script>

<style scoped lang="scss">
.gantt-grid-lines {
	position: absolute;
	inset-inline-start: 0;
	z-index: 1;
	pointer-events: none;
}

.gantt-vertical-lines {
	position: absolute;
	inset: 0;
}
</style>
