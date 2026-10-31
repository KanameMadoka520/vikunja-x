<template>
	<svg
		class="gantt-row-bars"
		:width="totalWidth"
		:height="ROW_HEIGHT"
		xmlns="http://www.w3.org/2000/svg"
		role="group"
		:aria-label="$t('project.gantt.taskBarsFor', {task: bars[0]?.meta?.label || ''})"
		:data-row-id="rowId"
	>
		<GanttBarPrimitive
			v-for="bar in bars"
			:key="bar.id"
			:model="bar"
			:timeline-start="dateFromDate"
			:timeline-end="dateToDate"
			:aria-label="getBarAriaLabel(bar)"
			:on-update="(id, start, end) => emit('updateTask', id, start, end)"
		>
			<!-- Gradient definitions for partial-date bars -->
			<defs v-if="bar.meta?.dateType === 'startOnly' || bar.meta?.dateType === 'endOnly'">
				<linearGradient
					:id="`gradient-${bar.id}`"
					x1="0"
					y1="0"
					x2="1"
					y2="0"
				>
					<stop
						v-if="bar.meta?.dateType === 'endOnly'"
						offset="0%"
						:stop-color="getBarFill(bar)"
						stop-opacity="0"
					/>
					<stop
						v-if="bar.meta?.dateType === 'endOnly'"
						offset="40%"
						:stop-color="getBarFill(bar)"
						stop-opacity="1"
					/>
					<stop
						v-if="bar.meta?.dateType === 'startOnly'"
						offset="60%"
						:stop-color="getBarFill(bar)"
						stop-opacity="1"
					/>
					<stop
						v-if="bar.meta?.dateType === 'startOnly'"
						offset="100%"
						:stop-color="getBarFill(bar)"
						stop-opacity="0"
					/>
				</linearGradient>
			</defs>

			<!-- Main bar (regular task) -->
			<rect
				v-if="!bar.meta?.isParent"
				v-tooltip="getBarTooltip(bar)"
				:x="getBarX(bar)"
				:y="BAR_INSET"
				:width="getBarWidth(bar)"
				:height="BAR_HEIGHT"
				:rx="BAR_RADIUS"
				:fill="getBarFillAttr(bar)"
				:opacity="bar.meta?.isDone ? 0.5 : 1"
				:stroke="getBarStroke(bar)"
				:stroke-width="getBarStrokeWidth(bar)"
				:stroke-dasharray="isDateless(bar) ? '5,5' : 'none'"
				class="gantt-bar"
				@pointerdown="handleBarPointerDown(bar, $event)"
			/>

			<!-- Parent summary bar (full height with diamond endpoints) -->
			<g
				v-if="bar.meta?.isParent"
				v-tooltip="getBarTooltip(bar)"
				class="gantt-bar gantt-parent-bar"
				@pointerdown="handleBarPointerDown(bar, $event)"
			>
				<rect
					:x="getBarX(bar)"
					:y="BAR_INSET"
					:width="getBarWidth(bar)"
					:height="BAR_HEIGHT"
					:rx="BAR_RADIUS"
					:fill="getBarFillAttr(bar)"
					:opacity="bar.meta?.isDone ? 0.5 : 1"
					:stroke="getBarStroke(bar)"
					:stroke-width="getBarStrokeWidth(bar)"
					:stroke-dasharray="bar.meta?.hasDerivedDates ? '4,2' : 'none'"
				/>
				<!-- Left diamond -->
				<polygon
					:points="getLeftDiamondPoints(bar)"
					:fill="getParentDiamondFill()"
					:stroke="getBarFillAttr(bar)"
					stroke-width="1"
					:opacity="bar.meta?.isDone ? 0.5 : 1"
				/>
				<!-- Right diamond -->
				<polygon
					:points="getRightDiamondPoints(bar)"
					:fill="getParentDiamondFill()"
					:stroke="getBarFillAttr(bar)"
					stroke-width="1"
					:opacity="bar.meta?.isDone ? 0.5 : 1"
				/>
			</g>

			<!-- Left resize handle (hidden for endOnly bars) -->
			<rect
				v-if="bar.meta?.dateType !== 'endOnly'"
				:x="getBarX(bar) - RESIZE_HANDLE_OFFSET"
				:y="BAR_INSET"
				:width="6"
				:height="BAR_HEIGHT"
				:rx="3"
				fill="var(--surface)"
				stroke="var(--primary)"
				stroke-width="1"
				class="gantt-resize-handle gantt-resize-left"
				aria-hidden="true"
				@pointerdown="startResize(bar, 'start', $event)"
			/>

			<!-- Right resize handle (hidden for startOnly bars) -->
			<rect
				v-if="bar.meta?.dateType !== 'startOnly'"
				:x="getBarX(bar) + getBarWidth(bar) - RESIZE_HANDLE_OFFSET"
				:y="BAR_INSET"
				:width="6"
				:height="BAR_HEIGHT"
				:rx="3"
				fill="var(--surface)"
				stroke="var(--primary)"
				stroke-width="1"
				class="gantt-resize-handle gantt-resize-right"
				aria-hidden="true"
				@pointerdown="startResize(bar, 'end', $event)"
			/>

			<!-- Task label with clipping -->
			<defs>
				<clipPath :id="`clip-${bar.id}`">
					<rect
						:x="getBarX(bar) + 2"
						:y="BAR_INSET"
						:width="getBarWidth(bar) - 4"
						:height="BAR_HEIGHT"
						:rx="BAR_RADIUS"
					/>
				</clipPath>
			</defs>
			<text
				:x="getBarTextX(bar)"
				:y="ROW_CENTER"
				dominant-baseline="central"
				:text-anchor="bar.meta?.dateType === 'endOnly' ? 'end' : 'start'"
				class="gantt-bar-text"
				:fill="getBarTextColor(bar)"
				:text-decoration="bar.meta?.isDone ? 'line-through' : 'none'"
				:clip-path="`url(#clip-${bar.id})`"
				aria-hidden="true"
			>
				{{ bar.meta?.label || bar.id }}
			</text>
		</GanttBarPrimitive>

		<!-- Collapse/expand chevron for parent tasks — rendered after bars so it paints on top -->
		<g
			v-if="isParent && bars[0]"
			class="gantt-collapse-toggle"
			:transform="`translate(${Math.max(0, getBarX(bars[0]) - 14)}, ${ROW_CENTER - 5})`"
			role="button"
			:aria-label="isCollapsed
				? $t('project.gantt.expandGroup', { task: bars[0]?.meta?.label || '' })
				: $t('project.gantt.collapseGroup', { task: bars[0]?.meta?.label || '' })"
			tabindex="0"
			@pointerdown.stop="emit('toggleCollapse')"
			@keydown.enter.stop="emit('toggleCollapse')"
			@keydown.space.prevent.stop="emit('toggleCollapse')"
		>
			<rect
				x="-2"
				y="-2"
				width="14"
				height="14"
				fill="transparent"
			/>
			<polygon
				v-if="isCollapsed"
				points="2,0 10,5 2,10"
				fill="var(--text-secondary)"
			/>
			<polygon
				v-else
				points="0,2 10,2 5,10"
				fill="var(--text-secondary)"
			/>
		</g>
	</svg>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import dayjs from 'dayjs'
import {useI18n} from 'vue-i18n'

import type {GanttBarModel} from '@/composables/useGanttBar'
import {getTextColor} from '@/helpers/color/getTextColor'
import {getNaturalDayCount} from '@/helpers/time/roundToNaturalDayBoundary'

import GanttBarPrimitive from './primitives/GanttBarPrimitive.vue'
import {
	GANTT_BAR_HEIGHT as BAR_HEIGHT,
	GANTT_BAR_INSET as BAR_INSET,
	GANTT_ROW_CENTER as ROW_CENTER,
	GANTT_ROW_HEIGHT as ROW_HEIGHT,
} from './ganttGeometry'

const props = defineProps<{
	bars: GanttBarModel[]
	totalWidth: number
	dateFromDate: Date
	dateToDate: Date
	dayWidthPixels: number
	isDragging: boolean
	isResizing: boolean
	dragState: {
		barId: string
		startX: number
		originalStart: Date
		originalEnd: Date
		currentDays: number
		edge?: 'start' | 'end'
	} | null
	focusedRow: string | null
	focusedCell: number | null
	rowId: string
	isParent: boolean
	isCollapsed: boolean
}>()

const emit = defineEmits<{
	(e: 'barPointerDown', bar: GanttBarModel, event: PointerEvent): void
	(e: 'startResize', bar: GanttBarModel, edge: 'start' | 'end', event: PointerEvent): void
	(e: 'updateTask', id: string, newStart: Date, newEnd: Date): void
	(e: 'toggleCollapse'): void
}>()

const {t} = useI18n({useScope: 'global'})

const RESIZE_HANDLE_OFFSET = 3
const BAR_RADIUS = 4
// White label text needs the darker accent the active view tab also uses in dark mode.
const DEFAULT_BAR_FILL = 'var(--switch-view-active-background)'
const LABEL_PADDING = 8

let measureCtx: CanvasRenderingContext2D | null | undefined
function measureLabel(text: string): number {
	if (measureCtx === undefined) {
		measureCtx = document.createElement('canvas').getContext('2d')
		if (measureCtx) {
			const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
			// Must match .gantt-bar-text font-size
			measureCtx.font = `${rootFontSize * 0.8125}px ${getComputedStyle(document.body).fontFamily}`
		}
	}
	return measureCtx ? measureCtx.measureText(text).width : text.length * 8
}

// Tooltip only for bars too narrow to show their full label
function getBarTooltip(bar: GanttBarModel): string | undefined {
	const label = bar.meta?.label || bar.id
	if (measureLabel(label) + LABEL_PADDING * 2 <= getBarWidth.value(bar)) {
		return undefined
	}
	return label
}

function addDays(dateOrValue: Date | string | number, days: number): Date {
	const date = new Date(dateOrValue)
	const newDate = new Date(date)
	newDate.setDate(newDate.getDate() + days)
	return newDate
}

function computeBarX(startDate: Date) {
	const daysDiff = dayjs(startDate).diff(dayjs(props.dateFromDate), 'day')
	const x = daysDiff * props.dayWidthPixels
	return x
}

function computeBarWidth(bar: GanttBarModel) {
	const diff = getNaturalDayCount(bar.start, bar.end)
	const width = diff * props.dayWidthPixels
	return width
}

const originalEndX = computed(() => props.dragState?.originalEnd 
	? computeBarX(props.dragState.originalEnd) 
	: 0)
const originalStartX = computed(() => props.dragState?.originalStart 
	? computeBarX(props.dragState.originalStart) 
	: 0)

const getBarX = computed(() => (bar: GanttBarModel) => {
	if (props.isDragging && props.dragState?.barId === bar.id) {
		const offset = props.dragState.currentDays * props.dayWidthPixels
		return originalStartX.value + offset
	}

	if (props.isResizing && props.dragState?.barId === bar.id && props.dragState.edge === 'start') {
		const newStart = addDays(props.dragState.originalStart, props.dragState.currentDays)
		return computeBarX(newStart)
	}
	return computeBarX(bar.start)
})

const getBarWidth = computed(() => (bar: GanttBarModel) => {
	if (props.isResizing && props.dragState?.barId === bar.id) {
		if (props.dragState.edge === 'start') {
			const newStart = addDays(props.dragState.originalStart, props.dragState.currentDays)
			const newStartX = computeBarX(newStart)
			return Math.max(0, originalEndX.value - newStartX)
		} else {
			const newEnd = addDays(props.dragState.originalEnd, props.dragState.currentDays)
			const newEndX = computeBarX(newEnd)
			return Math.max(0, newEndX - originalStartX.value)
		}
	}
	return computeBarWidth(bar)
})

const getBarTextX = computed(() => (bar: GanttBarModel) => {
	if (bar.meta?.dateType === 'endOnly') {
		return getBarX.value(bar) + getBarWidth.value(bar) - 8
	}
	// When the bar starts before the visible range, clamp text to the left edge
	// so the title remains visible within the visible portion of the bar.
	return Math.max(getBarX.value(bar) + 8, 8)
})

// Diamond endpoint helpers for parent summary bars
const DIAMOND_SIZE = 5

function getLeftDiamondPoints(bar: GanttBarModel): string {
	const x = getBarX.value(bar) - DIAMOND_SIZE
	const cy = ROW_CENTER
	return `${x},${cy} ${x + DIAMOND_SIZE},${cy - DIAMOND_SIZE} ${x + DIAMOND_SIZE * 2},${cy} ${x + DIAMOND_SIZE},${cy + DIAMOND_SIZE}`
}

function getRightDiamondPoints(bar: GanttBarModel): string {
	const x = getBarX.value(bar) + getBarWidth.value(bar) + DIAMOND_SIZE
	const cy = ROW_CENTER
	return `${x - DIAMOND_SIZE * 2},${cy} ${x - DIAMOND_SIZE},${cy - DIAMOND_SIZE} ${x},${cy} ${x - DIAMOND_SIZE},${cy + DIAMOND_SIZE}`
}

function getParentDiamondFill(): string {
	return 'var(--surface)'
}

function isPartialDate(bar: GanttBarModel) {
	return bar.meta?.dateType === 'startOnly' || bar.meta?.dateType === 'endOnly'
}

function isDateless(bar: GanttBarModel) {
	return !bar.meta?.hasActualDates && !isPartialDate(bar)
}

function getBarFill(bar: GanttBarModel) {
	// Partial dates still have "actual" dates on one side — use the task color
	if (isPartialDate(bar)) {
		if (bar.meta?.color) {
			return bar.meta.color
		}
		return DEFAULT_BAR_FILL
	}

	if (bar.meta?.hasActualDates) {
		if (bar.meta?.color) {
			return bar.meta.color
		}
		return DEFAULT_BAR_FILL
	}

	return 'var(--surface-sunken)'
}

function getBarFillAttr(bar: GanttBarModel): string {
	if (isPartialDate(bar)) {
		return `url(#gradient-${bar.id})`
	}
	return getBarFill(bar)
}

function getBarStroke(bar: GanttBarModel) {
	if (isDateless(bar)) {
		return 'var(--border-strong)'
	}
	return 'none'
}

function getBarStrokeWidth(bar: GanttBarModel) {
	if (isDateless(bar)) {
		return '2'
	}
	return '0'
}

function getBarTextColor(bar: GanttBarModel) {
	if (isDateless(bar)) {
		return 'var(--text-primary)'
	}

	if (bar.meta?.color) {
		return getTextColor(bar.meta.color)
	}

	return 'var(--text-on-accent)'
}

function getBarAriaLabel(bar: GanttBarModel): string {
	const task = bar.meta?.label || bar.id
	const startDate = bar.start.toLocaleDateString()
	const endDate = bar.end.toLocaleDateString()

	let dateType: string
	if (bar.meta?.dateType === 'startOnly') {
		dateType = t('project.gantt.partialDatesStart')
	} else if (bar.meta?.dateType === 'endOnly') {
		dateType = t('project.gantt.partialDatesEnd')
	} else if (bar.meta?.hasActualDates) {
		dateType = t('project.gantt.scheduledDates')
	} else {
		dateType = t('project.gantt.estimatedDates')
	}

	return t('project.gantt.taskBarLabel', {task, startDate, endDate, dateType})
}

function handleBarPointerDown(bar: GanttBarModel, event: PointerEvent) {
	emit('barPointerDown', bar, event)
}

function startResize(bar: GanttBarModel, edge: 'start' | 'end', event: PointerEvent) {
	emit('startResize', bar, edge, event)
}
</script>

<style scoped lang="scss">
.gantt-row-bars {
	position: absolute;
	inset-block-start: 0;
	inset-inline-start: 0;
	pointer-events: none;
	z-index: 4;
	overflow: visible;

	.gantt-bar {
		cursor: grab;
		pointer-events: all;

		&:hover {
			opacity: .85;
		}

		&:active {
			cursor: grabbing;
		}
	}

	:deep(text) {
		pointer-events: none;
		user-select: none;
	}
}

.gantt-collapse-toggle {
	pointer-events: all;
	cursor: pointer;

	&:hover polygon {
		fill: var(--text-primary);
	}

	&:focus {
		outline: none;
	}

	&:focus-visible {
		@include focus-ring;
	}

	&:focus polygon {
		fill: var(--accent-text);
	}
}

.gantt-bar-text {
	font-size: var(--text-sm);
	font-weight: var(--weight-medium);
	pointer-events: none;
	user-select: none;
}

.gantt-parent-bar {
	cursor: grab;
	pointer-events: all;
}

:deep(.gantt-resize-handle) {
	cursor: col-resize !important;
	opacity: 0;
	transition: opacity var(--motion-fast) var(--ease-standard);
	pointer-events: all; // Ensure they receive pointer events
}

// Show resize handles on bar hover
:deep(g:hover) .gantt-resize-handle {
	opacity: .8;

	&:hover {
		opacity: 1;
		cursor: inherit; // Use the specific cursor defined above
	}
}

// The focused bar gets a contrasting outline stroke: the text colour, not the accent the bar is filled with.
:deep(g[role="slider"]:focus) {
	outline: none;

	.gantt-bar {
		stroke: var(--text-primary) !important;
		stroke-width: 2 !important;
	}
}
</style>
