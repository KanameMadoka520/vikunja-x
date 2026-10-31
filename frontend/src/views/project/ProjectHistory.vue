<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'

import ProjectLifecycle from '@/components/project/history/ProjectLifecycle.vue'
import ProjectTimelineView from '@/components/project/history/ProjectTimelineView.vue'
import {useTitle} from '@/composables/useTitle'
import {HISTORY_TABS, parseHistoryTab, type HistoryTab} from '@/helpers/projectTimeline'
import {resolveUserTimezone} from '@/helpers/time/userTimezone'
import {useAuthStore} from '@/stores/auth'

const {t} = useI18n({useScope: 'global'})
useTitle(() => t('projectHistory.title'))
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const timezone = computed(() => resolveUserTimezone(auth.settings.timezone))
const currentYear = computed(() => Number(new Intl.DateTimeFormat('en', {
	year: 'numeric',
	timeZone: timezone.value,
}).format(new Date())))
const year = computed(() => Math.min(9998, Math.max(1970, Number(route.query.year) || currentYear.value)))
const tab = computed(() => parseHistoryTab(route.query.tab))

// Years the child views know have data; the select always offers a window around now too.
const knownYears = ref<number[]>([])
const years = computed(() => {
	const around = Array.from({length: 7}, (_, index) => currentYear.value - 5 + index)
	return [...new Set([
		...around,
		year.value,
		...knownYears.value,
	])].filter(y => y >= 1970 && y <= 9998).sort((a, b) => b - a)
})

// Params that only make sense inside one tab are dropped when switching.
const TAB_PARAMS = ['day', 'page', 'unknown', 'kind', 'status', 'month']

function changeYear(value: number) {
	void router.replace({
		query: {
			...route.query,
			year: value,
			day: undefined,
			page: undefined,
			unknown: undefined,
			month: undefined,
		},
	})
}

function selectTab(next: HistoryTab) {
	if (next === tab.value) return
	const query = {...route.query}
	TAB_PARAMS.forEach(key => delete query[key])
	void router.replace({
		query: {
			...query,
			tab: next === 'timeline' ? undefined : next,
		},
	})
}

const tabRefs = ref<HTMLButtonElement[]>([])
function moveTabFocus(event: KeyboardEvent, index: number) {
	const steps: Record<string, number> = {
		ArrowRight: 1,
		ArrowLeft: -1,
	}
	let next: number | null = null
	if (event.key in steps) {
		const direction = document.dir === 'rtl' ? -steps[event.key] : steps[event.key]
		next = (index + direction + HISTORY_TABS.length) % HISTORY_TABS.length
	} else if (event.key === 'Home') {
		next = 0
	} else if (event.key === 'End') {
		next = HISTORY_TABS.length - 1
	}
	if (next === null) return
	event.preventDefault()
	tabRefs.value[next]?.focus()
}
</script>

<template>
	<section class="project-history">
		<header class="history-heading">
			<div class="history-title">
				<h1>{{ t('projectHistory.title') }}</h1>
				<p>{{ t('projectHistory.subtitle') }}</p>
			</div>
			<div class="year-picker">
				<button
					type="button"
					class="history-button year-step"
					:disabled="year <= 1970"
					:aria-label="t('projectHistory.previousYear')"
					:title="t('projectHistory.previousYear')"
					@click="changeYear(year - 1)"
				>
					<Icon
						icon="angle-left"
						class="year-step-icon"
					/>
				</button>
				<label>
					<span class="is-sr-only">{{ t('projectHistory.year') }}</span>
					<select
						class="history-field year-select"
						:value="year"
						:aria-label="t('projectHistory.year')"
						@change="changeYear(Number(($event.target as HTMLSelectElement).value))"
					>
						<option
							v-for="y in years"
							:key="y"
							:value="y"
						>
							{{ y }}
						</option>
					</select>
				</label>
				<button
					type="button"
					class="history-button year-step"
					:disabled="year >= 9998"
					:aria-label="t('projectHistory.nextYear')"
					:title="t('projectHistory.nextYear')"
					@click="changeYear(year + 1)"
				>
					<Icon
						icon="angle-right"
						class="year-step-icon"
					/>
				</button>
			</div>
		</header>

		<div
			class="history-tabs"
			role="tablist"
			:aria-label="t('projectTimeline.tabs.label')"
		>
			<button
				v-for="(name, index) in HISTORY_TABS"
				:id="`history-tab-${name}`"
				:key="name"
				ref="tabRefs"
				type="button"
				role="tab"
				class="history-tab"
				:aria-selected="tab === name"
				:aria-controls="`history-panel-${name}`"
				:tabindex="tab === name ? 0 : -1"
				@click="selectTab(name)"
				@keydown="moveTabFocus($event, index)"
			>
				<Icon
					:icon="name === 'timeline' ? 'chart-gantt' : ['far', 'calendar-check']"
					class="history-tab-icon"
				/>
				{{ t(`projectTimeline.tabs.${name}`) }}
			</button>
		</div>

		<div
			:id="`history-panel-${tab}`"
			role="tabpanel"
			class="history-panel"
			:aria-labelledby="`history-tab-${tab}`"
		>
			<ProjectTimelineView
				v-if="tab === 'timeline'"
				:year="year"
				:timezone="timezone"
				@years="knownYears = $event"
				@changeYear="changeYear"
			/>
			<ProjectLifecycle v-else />
		</div>
	</section>
</template>

<style scoped lang="scss">
.project-history {
	// Room for the fixed Arona launcher at the end of the page.
	--history-launcher-clearance: 5rem;

	max-inline-size: var(--page-max-width);
	margin-inline: auto;
	padding-block-end: calc(var(--history-launcher-clearance) + env(safe-area-inset-bottom, 0px));
}

.history-heading {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: var(--space-3) var(--space-4);
	margin-block-end: var(--space-4);
}

.history-title {
	flex: 1 1 20rem;
	min-inline-size: 0;

	h1 {
		margin: 0;
		font-size: var(--text-2xl);

		@media screen and (max-width: $tablet) {
			font-size: var(--text-xl);
		}
	}

	p {
		margin-block-start: var(--space-1);
		max-inline-size: 70ch;
		color: var(--text-secondary);
		font-size: var(--text-md);
	}
}

.year-picker {
	display: flex;
	align-items: center;
	gap: var(--space-2);
}

.history-button,
.history-field {
	min-block-size: var(--control-height);
	padding: .3rem .7rem;
	border: 1px solid var(--input-border-color);
	border-radius: $radius;
	background: var(--surface);
	color: var(--text-primary);
	font: inherit;
	font-size: var(--text-md);

	&:focus-visible {
		outline: 2px solid var(--focus-ring-color);
		outline-offset: 2px;
	}
}

.history-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: background-color var(--motion-fast) var(--ease-standard);

	&:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	&:disabled {
		cursor: default;
		opacity: .45;
	}
}

.year-step {
	inline-size: var(--control-height);
	padding: 0;
}

.year-step-icon:dir(rtl) {
	transform: scaleX(-1);
}

.year-select {
	font-variant-numeric: tabular-nums;
}

.history-tabs {
	display: flex;
	gap: var(--space-1);
	margin-block-end: var(--space-4);
	border-block-end: 1px solid var(--border-subtle);
	overflow-x: auto;
	scrollbar-width: none;
}

.history-tab {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	min-block-size: var(--control-height);
	padding: 0 var(--space-3);
	border: 0;
	border-radius: var(--radius-sm) var(--radius-sm) 0 0;
	background: transparent;
	color: var(--text-secondary);
	font: inherit;
	font-size: var(--text-md);
	font-weight: var(--weight-medium);
	white-space: nowrap;
	cursor: pointer;
	transition: color var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard);

	&::after {
		content: '';
		position: absolute;
		inset-inline: var(--space-2);
		inset-block-end: -1px;
		block-size: 2px;
		border-radius: 2px;
		background: transparent;
	}

	&:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}

	&[aria-selected='true'] {
		color: var(--accent-text);
		font-weight: var(--weight-semibold);

		&::after {
			background: var(--primary);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--focus-ring-color);
		outline-offset: -2px;
	}
}

.history-tab-icon {
	font-size: var(--text-sm);
}
</style>
