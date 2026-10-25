<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const props = defineProps<{page: TcyShowcasePublicResponse}>()
const {t, locale} = useI18n({useScope: 'global'})
import {computed} from 'vue'
import {marked} from 'marked'
import DOMPurify from 'dompurify'
import type {TcyShowcasePublicResponse} from '@/client/generated'
import TcyBrand from '@/components/home/TcyBrand.vue'

const events = computed(() => props.page.events ?? [])
const free = computed(() => props.page.free ?? [])
const projects = computed(() => props.page.projects ?? [])
const formatTime = (value?: string) => value ? new Date(value).toLocaleString(locale.value, {timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short'}) : ''
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const custom = computed(() => {
	if (!props.page.content) return ''
	const schedule = '<ul>' + events.value.map(e => `<li>${escape(formatTime(e.start))}${e.kind === 'busy' ? ' — ' + escape(formatTime(e.end)) : t('tcymc.text.due')} · ${escape(e.title ?? '')} · ${escape(e.project ?? '')}</li>`).join('') + '</ul>'
	const availability = '<ul>' + free.value.map(f => `<li>${escape(formatTime(f.start))} — ${escape(formatTime(f.end))}</li>`).join('') + '</ul>'
	const names = '<ul>' + projects.value.map(p => `<li>${escape(p)}</li>`).join('') + '</ul>'
	const raw = props.page.format === 'html' ? props.page.content : marked.parse(props.page.content, {async: false})
	const content = DOMPurify.sanitize(raw, {ADD_TAGS: ['style']}).replaceAll('{{schedule}}', schedule).replaceAll('{{availability}}', availability).replaceAll('{{projects}}', names)
	return `<!doctype html><html lang="${escape(locale.value)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; form-action 'none'"><style>
body{font:16px/1.7 system-ui,sans-serif;color:#26314a;margin:20px;overflow-wrap:anywhere}img{max-width:100%}a{color:#4568ca}li{margin:8px 0}
</style></head><body>${content}</body></html>`
})
</script>

<template>
	<article class="showcase-page">
		<header class="showcase-hero">
			<span class="eyebrow">{{ t('tcymc.publicEyebrow') }}</span><h1>{{ page.title }}</h1><p>{{ page.intro }}</p><span class="timezone">{{ t('tcymc.text.asia_shanghai_china_standard_time') }}</span>
		</header>
		<iframe
			v-if="custom"
			class="custom-page"
			:title="t('tcymc.text.custom_public_content')"
			sandbox=""
			referrerpolicy="no-referrer"
			:srcdoc="custom"
		/>
		<div
			v-if="!page.custom_layout"
			class="showcase-columns"
		>
			<section>
				<h2>{{ t('tcymc.text.upcoming_schedule') }}</h2><p
					v-if="!events.length"
					class="empty"
				>
					{{ t('tcymc.text.there_are_no_published_events_for_this_period') }}
				</p><div
					v-for="(event, index) in events"
					:key="index"
					class="schedule-event"
				>
					<span class="event-kind">{{ event.kind === 'busy' ? t('tcymc.text.time_block') : t('tcymc.text.due_item') }}</span><h3>{{ event.title }}</h3><p>{{ event.project }}</p><time>{{ formatTime(event.start) }}<template v-if="event.kind === 'busy'"> — {{ formatTime(event.end) }}</template></time>
				</div>
			</section>
			<section>
				<h2>{{ t('tcymc.text.available_times') }}</h2><p class="explanation">
					{{ t('tcymc.text.these_times_are_not_occupied_by_your_published') }}
				</p><p
					v-if="!free.length"
					class="empty"
				>
					{{ t('tcymc.text.there_are_no_available_times_to_show') }}
				</p><div
					v-for="(slot, index) in free"
					:key="index"
					class="free-slot"
				>
					{{ formatTime(slot.start) }}<br>{{ t('tcymc.text.to') }}{{ formatTime(slot.end) }}
				</div><h2 class="projects-heading">
					{{ t('tcymc.text.current_projects') }}
				</h2><span
					v-for="(project, index) in projects"
					:key="index"
					class="project-pill"
				>{{ project }}</span>
			</section>
		</div>
		<footer><p>{{ t('tcymc.text.schedule_generated_at') }} {{ formatTime(page.generated_at) }} · {{ t('tcymc.text.showing_until') }} {{ formatTime(page.until) }}</p><TcyBrand /></footer>
	</article>
</template>

<style scoped>
.showcase-page {
	overflow-wrap: anywhere;
	max-inline-size: 1100px;
	margin-inline: auto;
	padding: 2rem;
	color: var(--grey-800);
	}
.showcase-hero {
	padding-block: 2rem;
	border-block-end: 1px solid var(--grey-200);
	}
.eyebrow {
	color: var(--primary);
	font-size: .75rem;
	letter-spacing: .18em;
	}
h1 {
	margin-block: .7rem;
	font-size: clamp(2rem, 5vw, 3.5rem);
	}
h2 {
	margin-block-end: 1rem;
	font-size: 1.3rem;
	}
h3 {
	margin-block: .4rem;
	font-size: 1.1rem;
	}
.timezone {
	display: inline-block;
	margin-block-start: 1rem;
	font-size: .8rem;
	color: var(--grey-600);
	}
.showcase-columns {
	display: grid;
	grid-template-columns: 1.4fr 1fr;
	gap: 2rem;
	margin-block: 2rem;
	}
.schedule-event {
	margin-block-end: 1rem;
	padding: 1.1rem;
	border: 1px solid var(--grey-200);
	border-inline-start: 3px solid var(--primary);
	border-radius: .5rem;
	background: var(--white);
	}
.event-kind, time {
	font-size: .8rem;
	color: var(--grey-600);
	}
.schedule-event p {
	margin-block-end: .5rem;
	}
.free-slot {
	padding: .8rem;
	margin-block-end: .7rem;
	border-radius: .5rem;
	background: var(--grey-100);
	font-size: .9rem;
	}
.explanation, .empty {
	margin-block-end: 1rem;
	color: var(--grey-600);
	font-size: .9rem;
	}
.projects-heading {
	margin-block-start: 2rem;
	}
.project-pill {
	display: inline-block;
	padding: .4rem .8rem;
	margin: .2rem;
	background: var(--grey-100);
	border-radius: 2rem;
	font-size: .85rem;
	}
.custom-page {
	inline-size: 100%;
	block-size: 440px;
	resize: vertical;
	border: 1px solid var(--grey-200);
	border-radius: .5rem;
	margin-block-start: 1rem;
	background: white;
	}
footer {
	border-block-start: 1px solid var(--grey-200);
	padding-block-start: 1rem;
	text-align: center;
	font-size: .8rem;
	color: var(--grey-600);
	}
@media (width <= 700px) {
	.showcase-columns {
	grid-template-columns: 1fr;
	} .showcase-page {
	overflow-wrap: anywhere;
	padding: 1rem;
	}
}
</style>
