<script setup lang="ts">
import {computed, ref, watch, nextTick} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {useDebounceFn} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import {projectHistoryQuery} from '@/client/queries/projectHistory'
import {useProjects} from '@/composables/useProjects'
import {useAuthStore} from '@/stores/auth'
import {useTitle} from '@/composables/useTitle'
import {projectCalendar} from '@/helpers/projectCalendar'

const {t, locale} = useI18n({useScope: 'global'})
useTitle(() => t('projectHistory.title'))
const route = useRoute()
const router = useRouter()
const projects = useProjects()
const auth = useAuthStore()
const timezone = computed(() => auth.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
const currentYear = computed(() => Number(new Intl.DateTimeFormat('en', {year: 'numeric', timeZone: timezone.value}).format(new Date())))
const year = computed(() => Math.min(9998, Math.max(1970, Number(route.query.year) || currentYear.value)))
const project = computed(() => Math.max(0, Number(route.query.project) || 0))
const kind = computed(() => ['completed', 'archived', 'reopened', 'unarchived', 'all'].includes(String(route.query.kind)) ? String(route.query.kind) : 'milestones')
const day = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(String(route.query.day)) ? String(route.query.day) : '')
const unknown = computed(() => route.query.unknown === 'true')
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const search = ref(String(route.query.q || ''))
watch(() => route.query.q, value => { search.value = String(value || '') })
function select(values: Record<string, string | number | undefined>) {
	return router.replace({query: {...route.query, page: undefined, ...values}})
}
const updateSearch = useDebounceFn(() => select({q: search.value || undefined, day: undefined, unknown: undefined}), 300)
const query = useQuery(computed(() => projectHistoryQuery({year: year.value, timezone: timezone.value, project: project.value, kind: kind.value as 'milestones', day: day.value || undefined, unknown: unknown.value, q: String(route.query.q || ''), page: page.value})))
const history = computed(() => query.data.value)
const years = computed(() => [...new Set([currentYear.value, year.value, ...(history.value?.years || [])])].sort((a, b) => b - a))
const days = computed(() => projectCalendar(year.value))
const months = computed(() => Array.from({length: 12}, (_, month) => ({
	name: new Intl.DateTimeFormat(locale.value, {month: 'short', timeZone: 'UTC'}).format(new Date(Date.UTC(year.value, month, 1))),
	days: days.value.filter(d => d.month === month),
})))
const pickedMonth = ref<number | null>(null)
watch(year, () => { pickedMonth.value = null })
const shownMonth = computed(() => pickedMonth.value ?? (day.value ? Number(day.value.slice(5, 7)) - 1 : year.value === currentYear.value ? Number(new Intl.DateTimeFormat('en', {month: 'numeric', timeZone: timezone.value}).format(new Date())) - 1 : Math.max(0, months.value.findIndex(m => m.days.some(d => count(d.date))))))
const monthCount = (index: number) => months.value[index].days.reduce((total, d) => total + count(d.date), 0)
const weekDays = computed(() => Array.from({length: 7}, (_, index) => new Intl.DateTimeFormat(locale.value, {weekday: 'narrow', timeZone: 'UTC'}).format(new Date(Date.UTC(2024, 0, 1 + index)))))
function chooseMonth(index: number) {
	pickedMonth.value = index
	void select({day: undefined, unknown: undefined})
}
const max = computed(() => Math.max(1, ...Object.values(history.value?.days || {})))
const count = (date: string) => history.value?.days?.[date] || 0
const level = (date: string) => count(date) ? Math.max(1, Math.ceil(count(date) / max.value * 4)) : 0
const label = (date: string) => t('projectHistory.dayLabel', {date, count: count(date)})
function chooseDay(date: string) { void select({day: day.value === date ? undefined : date, unknown: undefined}) }
function changeYear(value: number) { void select({year: value, day: undefined, unknown: undefined}) }
async function keyboardDay(event: KeyboardEvent, date: string, monthly = false) {
	const step = ({ArrowRight: monthly ? 1 : 7, ArrowLeft: monthly ? -1 : -7, ArrowDown: monthly ? 7 : 1, ArrowUp: monthly ? -7 : -1} as Record<string, number>)[event.key]
	if (!step) return
	event.preventDefault()
	const index = days.value.findIndex(d => d.date === date)
	const next = days.value[Math.min(days.value.length - 1, Math.max(0, index + step))]
	if (monthly) { pickedMonth.value = next.month; await nextTick() }
	const container = (event.target as HTMLElement).closest(monthly ? '.month-grid' : '.year-grid')
	container?.querySelector<HTMLButtonElement>(`button[data-date="${next.date}"]`)?.focus()
}
function formatDate(value?: string) {
	if (!value || value.startsWith('0001')) return t('projectHistory.unknownDate')
	return new Intl.DateTimeFormat(locale.value, {dateStyle: 'medium', timeZone: timezone.value}).format(new Date(value))
}
watch(() => history.value?.total_pages, total => {
	if (total !== undefined && page.value > Math.max(1, total)) void select({page: Math.max(1, total)})
})
</script>

<template>
	<section
		class="project-history"
		:aria-busy="query.isFetching.value"
	>
		<header class="history-heading">
			<div><h1>{{ t('projectHistory.title') }}</h1><p>{{ t('projectHistory.subtitle') }}</p></div>
			<div class="year-picker">
				<button
					:disabled="year <= 1970"
					:aria-label="t('projectHistory.previousYear')"
					@click="changeYear(year - 1)"
				>
					‹
				</button>
				<label><span class="is-sr-only">{{ t('projectHistory.year') }}</span><select
					:value="year"
					:aria-label="t('projectHistory.year')"
					@change="changeYear(Number(($event.target as HTMLSelectElement).value))"
				><option
					v-for="y in years"
					:key="y"
					:value="y"
				>{{ y }}</option></select></label>
				<button
					:disabled="year >= 9998"
					:aria-label="t('projectHistory.nextYear')"
					@click="changeYear(year + 1)"
				>
					›
				</button>
			</div>
		</header>
		<div class="history-filters">
			<label>{{ t('projectHistory.project') }}<select
				:value="project"
				:aria-label="t('projectHistory.project')"
				@change="select({project: ($event.target as HTMLSelectElement).value, day: undefined, unknown: undefined})"
			><option :value="0">{{ t('projectHistory.allProjects') }}</option><option
				v-for="p in projects.projectsArray.filter(p => p.id > 0)"
				:key="p.id"
				:value="p.id"
			>{{ p.title }}{{ p.is_archived ? ' · ' + t('projectHistory.archivedBadge') : '' }}</option></select></label>
			<label>{{ t('projectHistory.type') }}<select
				:value="kind"
				:aria-label="t('projectHistory.type')"
				@change="select({kind: ($event.target as HTMLSelectElement).value, day: undefined, unknown: undefined})"
			><option
				v-for="k in ['milestones', 'completed', 'archived', 'all', 'reopened', 'unarchived']"
				:key="k"
				:value="k"
			>{{ t('projectHistory.kinds.' + k) }}</option></select></label>
			<label>{{ t('projectHistory.search') }}<input
				v-model="search"
				:aria-label="t('projectHistory.search')"
				type="search"
				maxlength="250"
				:placeholder="t('projectHistory.searchPlaceholder')"
				@input="updateSearch()"
			></label>
		</div>
		<div
			v-if="query.isError.value"
			class="history-state"
			role="alert"
		>
			<p>{{ t('projectHistory.loadError') }}</p><button @click="query.refetch()">
				{{ t('projectHistory.retry') }}
			</button>
		</div>
		<div
			v-else-if="query.isPending.value"
			class="history-state"
			role="status"
		>
			{{ t('projectHistory.loading') }}
		</div>
		<template v-else-if="history">
			<div
				class="history-stats"
				aria-live="polite"
			>
				<div><strong>{{ history.projects }}</strong><span>{{ t('projectHistory.projectsCount') }}</span></div>
				<div><strong>{{ history.milestones }}</strong><span>{{ t('projectHistory.milestonesCount') }}</span></div>
				<div><strong>{{ history.active_days }}</strong><span>{{ t('projectHistory.activeDays') }}</span></div>
			</div>
			<section
				class="calendar-card"
				:aria-label="t('projectHistory.calendar')"
			>
				<div class="year-calendar">
					<div class="month-labels">
						<span
							v-for="month in months"
							:key="month.name"
							:style="{gridColumn: String(month.days[0].week + 1)}"
						>{{ month.name }}</span>
					</div>
					<div class="year-grid">
						<button
							v-for="d in days"
							:key="d.date"
							:data-date="d.date"
							:data-level="level(d.date)"
							:aria-label="label(d.date)"
							:title="label(d.date)"
							:aria-pressed="day === d.date && !unknown"
							:tabindex="d.date === (day || days[0].date) ? 0 : -1"
							:style="{gridColumn: d.week + 1, gridRow: d.weekday + 1}"
							@click="chooseDay(d.date)"
							@keydown="keyboardDay($event, d.date)"
						/>
					</div>
				</div>
				<div class="month-picker">
					<button
						v-for="(month, index) in months"
						:key="month.name"
						:aria-pressed="shownMonth === index"
						:aria-label="t('projectHistory.dayLabel', {date: month.name, count: monthCount(index)})"
						@click="chooseMonth(index)"
					>
						{{ month.name }}<span v-if="monthCount(index)">{{ monthCount(index) }}</span>
					</button>
				</div>
				<div class="month-grid">
					<section
						v-for="(month, index) in months"
						v-show="index === shownMonth"
						:key="month.name"
						class="mini-month"
					>
						<h3>{{ month.name }}</h3>
						<div
							class="month-weekdays"
							aria-hidden="true"
						>
							<span
								v-for="(weekday, weekIndex) in weekDays"
								:key="weekIndex"
							>{{ weekday }}</span>
						</div>
						<div class="month-days">
							<button
								v-for="d in month.days"
								:key="d.date"
								:data-date="d.date"
								:data-level="level(d.date)"
								:title="label(d.date)"
								:aria-label="label(d.date)"
								:aria-pressed="day === d.date && !unknown"
								:tabindex="d.date === (day || month.days[0].date) ? 0 : -1"
								:style="{gridColumn: d.weekday + 1}"
								@click="chooseDay(d.date)"
								@keydown="keyboardDay($event, d.date, true)"
							>
								{{ d.day }}
							</button>
						</div>
					</section>
				</div>
				<div class="calendar-legend">
					<span>{{ t('projectHistory.less') }}</span><i
						v-for="n in 5"
						:key="n"
						:data-level="n - 1"
					/><span>{{ t('projectHistory.more') }}</span><span>{{ timezone }}</span>
				</div>
				<p class="calendar-help">
					{{ t('projectHistory.calendarHelp') }}
				</p>
			</section>
			<div class="records-heading">
				<h2>{{ unknown ? t('projectHistory.unknownHeading') : day || t('projectHistory.yearRecords', {year}) }} <small>({{ history.total }})</small></h2>
				<div class="record-actions">
					<button
						v-if="day || unknown"
						@click="select({day: undefined, unknown: undefined})"
					>
						{{ t('projectHistory.clearDay') }}
					</button>
					<button
						v-if="history.unknown"
						:aria-pressed="unknown"
						@click="select({unknown: unknown ? undefined : 'true', day: undefined})"
					>
						{{ t('projectHistory.unknownRecords', {count: history.unknown}) }}
					</button>
				</div>
			</div>
			<p
				v-if="unknown"
				class="calendar-help"
			>
				{{ t('projectHistory.unknownHelp') }}
			</p>
			<p
				v-if="query.isPlaceholderData.value"
				role="status"
				class="history-state"
			>
				{{ t('projectHistory.loading') }}
			</p>
			<div
				v-else-if="!history.items?.length"
				class="history-state"
			>
				<Icon icon="calendar" /><h3>{{ t('projectHistory.empty') }}</h3><p>{{ t('projectHistory.emptyHelp') }}</p>
			</div>
			<ol
				v-else
				class="history-records"
			>
				<li
					v-for="item in history.items"
					:key="item.id"
				>
					<div class="record-event">
						<span
							class="event-badge"
							:data-kind="item.kind"
						>{{ t('projectHistory.kinds.' + item.kind) }}</span><time>{{ formatDate(item.occurred_at) }}</time>
					</div>
					<RouterLink
						class="record-title"
						:to="{name: 'project.index', params: {projectId: item.project_id}}"
					>
						{{ item.title }}
					</RouterLink>
					<p class="record-span">
						{{ t('projectHistory.recordSpan', {start: formatDate(item.created), end: formatDate(item.occurred_at)}) }}
					</p>
					<div class="record-status">
						<span v-if="item.is_completed">{{ t('projectHistory.completedBadge') }}</span><span v-if="item.is_archived">{{ t('projectHistory.archivedBadge') }}</span><span v-if="!item.is_completed && !item.is_archived">{{ t('projectHistory.activeBadge') }}</span>
					</div>
				</li>
			</ol>
			<nav
				v-if="(history.total_pages || 0) > 1"
				class="history-pagination"
				:aria-label="t('projectHistory.pagination')"
			>
				<button
					:disabled="page <= 1"
					@click="select({page: page - 1})"
				>
					{{ t('projectHistory.previous') }}
				</button><span>{{ page }} / {{ history.total_pages }}</span><button
					:disabled="page >= (history.total_pages || 1)"
					@click="select({page: page + 1})"
				>
					{{ t('projectHistory.next') }}
				</button>
			</nav>
		</template>
		<details class="history-explanation">
			<summary>{{ t('projectHistory.explanation') }}</summary><p>{{ t('projectHistory.explanationText') }}</p><p>{{ t('projectHistory.archiveHelp') }}</p>
		</details>
	</section>
</template>

<style scoped lang="scss">
.project-history {
max-inline-size: 1100px;
margin-inline: auto;
padding-block-end: 2rem;
}
h1 {
font-size: 1.6rem;
font-weight: 700;
}
h2 {
font-size: 1.1rem;
font-weight: 600;
}
.history-heading, .records-heading {
display: flex;
align-items: center;
justify-content: space-between;
gap: 1rem;
margin-block-end: 1.5rem;
}
.history-heading p, .calendar-help, .record-span, .history-explanation {
color: var(--grey-600);
font-size: .875rem;
line-height: 1.65;
}
button, select, input {
font: inherit;
color: var(--text);
background: var(--white);
border: 1px solid var(--grey-300);
border-radius: .55rem;
padding: .55rem .75rem;
min-block-size: 40px;
}
button {
cursor: pointer;
}
button:disabled {
cursor: default;
opacity: .4;
}
button:focus-visible, select:focus-visible, input:focus-visible {
outline: 2px solid var(--primary);
outline-offset: 3px;
}
.year-picker, .record-actions, .history-pagination {
display: flex;
align-items: center;
gap: .5rem;
}
.year-picker button {
font-size: 1.4rem;
line-height: 1;
}
.history-filters {
display: grid;
grid-template-columns: 1fr 1fr 1fr;
gap: 1rem;
margin-block-end: 1.5rem;
}
.history-filters label {
display: flex;
flex-direction: column;
gap: .4rem;
font-size: .875rem;
min-inline-size: 0;
}
.history-filters select, .history-filters input {
inline-size: 100%;
min-inline-size: 0;
}
.history-stats {
display: flex;
gap: 3rem;
margin-block-end: 1.5rem;
}
.history-stats div {
display: flex;
flex-direction: column;
gap: .25rem;
}
.history-stats strong {
font-size: 1.75rem;
font-variant-numeric: tabular-nums;
}
.history-stats span {
color: var(--grey-600);
font-size: .875rem;
}
.calendar-card {
padding: 1.5rem;
border: 1px solid var(--grey-200);
border-radius: 1rem;
background: var(--white);
margin-block-end: 1.5rem;
}
.year-calendar {
overflow-x: auto;
padding: 4px;
}
.year-grid, .month-labels {
display: grid;
grid-template-columns: repeat(54, minmax(11px, 1fr));
gap: 3px;
min-inline-size: 720px;
}
.month-labels {
font-size: .7rem;
margin-block-end: .6rem;
}
.month-labels span {
white-space: nowrap;
}
.year-grid {
grid-template-rows: repeat(7, 13px);
}
.year-grid button {
min-block-size: 0;
padding: 0;
border: 0;
border-radius: 3px;
}
[data-level="0"] {
background: var(--grey-100);
}
[data-level="1"] {
background: #c6e9c9;
color: #154728;
}
[data-level="2"] {
background: #74c78c;
color: #133c22;
}
[data-level="3"] {
background: #237e4b;
color: #ffffff;
}
[data-level="4"] {
background: #176b43;
color: #ffffff;
}
button[aria-pressed="true"] {
outline: 2px solid var(--primary);
outline-offset: 2px;
}
.calendar-legend {
display: flex;
justify-content: flex-end;
align-items: center;
gap: .35rem;
font-size: .75rem;
margin-block: 1rem .5rem;
}
.calendar-legend i {
inline-size: 12px;
block-size: 12px;
border-radius: 3px;
}
.calendar-legend span:last-child {
margin-inline-start: .75rem;
}
.month-grid {
display: none;
}
.history-records {
display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
list-style: none;
gap: 1rem;
padding: 0;
}
.history-records li {
border: 1px solid var(--grey-200);
border-radius: .85rem;
padding: 1.25rem;
background: var(--white);
}
.record-event {
display: flex;
justify-content: space-between;
align-items: center;
gap: .5rem;
font-size: .8rem;
margin-block-end: .75rem;
}
.event-badge {
padding: .2rem .5rem;
border-radius: .4rem;
background: var(--grey-100);
}
.event-badge[data-kind="completed"] {
background: #c6e9c9;
color: #154728;
}
.record-title {
font-size: 1.05rem;
font-weight: 600;
overflow-wrap: anywhere;
}
.record-span {
margin-block: .6rem;
}
.record-status {
display: flex;
gap: .5rem;
color: var(--grey-600);
font-size: .75rem;
}
.history-pagination {
justify-content: center;
margin-block: 1.5rem;
}
.history-state {
padding: 3rem 1rem;
text-align: center;
color: var(--grey-600);
}
.history-state h3 {
margin-block: .75rem;
font-weight: 600;
}
.history-explanation {
margin-block-start: 1.5rem;
}
.history-explanation summary {
cursor: pointer;
}
@media (width <= 700px) {
 .history-heading, .records-heading {
flex-wrap: wrap;
}
 .history-filters {
grid-template-columns: 1fr;
}
 .history-stats {
gap: 1.5rem;
}
 .calendar-card {
padding: 1rem;
}
 .year-calendar {
display: none;
}
 .month-grid {
display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 1.25rem;
}
 .mini-month h3 {
font-size: .85rem;
margin-block-end: .5rem;
}
 .month-days {
display: grid;
grid-template-columns: repeat(7, minmax(0, 1fr));
gap: 3px;
}
 .month-days button {
padding: 0;
min-block-size: 28px;
border: 0;
border-radius: 3px;
font-size: .7rem;
}
 .history-records {
grid-template-columns: 1fr;
}
 .record-actions {
flex-wrap: wrap;
}
}
@media (width <= 440px) {
 .month-grid {
grid-template-columns: 1fr;
}
 .month-days button {
min-block-size: 32px;
}
}
.month-picker {
display: none;
}
@media (width <= 700px) {
 .month-picker {
display: grid;
grid-template-columns: repeat(6, minmax(0, 1fr));
gap: .4rem;
margin-block-end: 1.2rem;
}
 .month-picker button {
padding: .4rem .1rem;
font-size: .75rem;
min-block-size: 42px;
}
 .month-picker button span {
display: block;
font-size: .65rem;
color: var(--primary);
}
 .month-grid {
grid-template-columns: 1fr;
}
 .month-weekdays {
display: grid;
grid-template-columns: repeat(7, minmax(0, 1fr));
text-align: center;
font-size: .75rem;
color: var(--grey-600);
margin-block-end: .4rem;
}
 .month-days button {
min-block-size: 36px;
font-size: .8rem;
}
}
</style>
