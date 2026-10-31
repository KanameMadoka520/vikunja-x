<template>
	<section
		v-if="announcement && !isEmpty"
		class="project-announcement"
		:class="{'is-collapsed': collapsed}"
		:aria-labelledby="headingId"
	>
		<div class="project-announcement__header">
			<Icon
				icon="bullhorn"
				class="project-announcement__icon"
			/>
			<h2
				:id="headingId"
				class="project-announcement__title"
				data-user-content
			>
				{{ collapsed ? collapsedTitle : heading }}
			</h2>
			<p
				v-if="announcement.updated"
				class="project-announcement__meta"
			>
				<time
					v-tooltip="formatDateLong(announcement.updated)"
					:datetime="announcement.updated"
				>{{ updatedText }}</time>
			</p>
			<div class="project-announcement__actions">
				<XButton
					v-if="canEdit"
					variant="tertiary"
					icon="pen"
					class="project-announcement__action is-small"
					:shadow="false"
					:aria-label="$t('project.announcement.editLabel')"
					@click="emit('edit', announcement)"
				>
					{{ $t('project.announcement.edit') }}
				</XButton>
				<XButton
					v-if="hasContent"
					variant="tertiary"
					:icon="collapsed ? 'chevron-down' : 'chevron-up'"
					class="project-announcement__action is-small"
					:shadow="false"
					:aria-expanded="!collapsed"
					:aria-controls="bodyId"
					@click="setCollapsed(!collapsed)"
				>
					{{ collapsed ? $t('project.announcement.expand') : $t('project.announcement.collapse') }}
				</XButton>
			</div>
		</div>

		<div
			v-if="hasContent"
			v-show="!collapsed"
			:id="bodyId"
			class="project-announcement__body"
		>
			<!-- Only sanitizeAnnouncement() output reaches v-html. -->
			<!-- eslint-disable vue/no-v-html -->
			<div
				:id="contentId"
				ref="contentRef"
				class="project-announcement__content"
				:class="{
					'is-clamped': !showAll,
					'is-overflowing': overflowing && !showAll,
				}"
				data-user-content
				@focusin="revealFocused"
				v-html="html"
			/>
			<!-- eslint-enable vue/no-v-html -->
			<BaseButton
				v-if="overflowing || showAll"
				class="project-announcement__more"
				:aria-expanded="showAll"
				:aria-controls="contentId"
				@click="showAll = !showAll"
			>
				{{ showAll ? $t('project.announcement.showLess') : $t('project.announcement.showAll') }}
			</BaseButton>
		</div>
	</section>
</template>

<script setup lang="ts">
import {computed, nextTick, ref, useId, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useResizeObserver} from '@vueuse/core'

import BaseButton from '@/components/base/BaseButton.vue'
import XButton from '@/components/input/Button.vue'
import Icon from '@/components/misc/Icon'

import type {ProjectAnnouncementResponse} from '@/client/queries/projectAnnouncements'
import {useProjectAnnouncement} from '@/composables/useProjectAnnouncement'
import {getApiBaseUrl} from '@/helpers/apiUrl'
import {announcementCollapseStorageKey, useAnnouncementCollapse} from '@/helpers/projectAnnouncementCollapse'
import {announcementTextLines, sanitizeAnnouncement} from '@/helpers/sanitizeAnnouncement'
import {formatDateLong, formatDateSince} from '@/helpers/time/formatDate'
import {useAuthStore} from '@/stores/auth'

import {canEditAnnouncement} from './announcementState'

const props = defineProps<{
	projectId: number
	archived: boolean
}>()

const emit = defineEmits<{
	edit: [announcement: ProjectAnnouncementResponse]
}>()

const {t} = useI18n({useScope: 'global'})
const authStore = useAuthStore()

const headingId = useId()
const bodyId = useId()
const contentId = useId()

const {announcement} = useProjectAnnouncement(() => props.projectId)

const title = computed(() => announcement.value?.title.trim() ?? '')
const textLines = computed(() => announcementTextLines(announcement.value?.content ?? ''))
const hasContent = computed(() => textLines.value.length > 0)
const isEmpty = computed(() => title.value === '' && !hasContent.value)
const html = computed(() => hasContent.value ? sanitizeAnnouncement(announcement.value?.content ?? '') : '')

const heading = computed(() => title.value || t('project.announcement.defaultTitle'))
// Collapsed to one line: without a title, the first line of text says more than "Announcement".
const collapsedTitle = computed(() => title.value || textLines.value[0] || t('project.announcement.defaultTitle'))

const canEdit = computed(() => canEditAnnouncement(announcement.value, props.archived))

const updatedBySelf = computed(() => {
	const self = authStore.info?.id
	const by = announcement.value?.updated_by_id ?? 0
	if (!self || !by) return false
	// The server records link-share writes under the negated share id.
	return by === (authStore.isLinkShareAuth ? -self : self)
})
// There is no user lookup by id, so anyone else stays unnamed rather than shown as a number.
const updatedText = computed(() => {
	const time = formatDateSince(announcement.value?.updated)
	return updatedBySelf.value
		? t('project.announcement.updatedByYou', {time})
		: t('project.announcement.updatedAt', {time})
})

const collapseKey = computed(() => {
	const id = authStore.info?.id
	return id ? announcementCollapseStorageKey(getApiBaseUrl(), {id, linkShare: authStore.isLinkShareAuth}) : ''
})
const {collapsed, setCollapsed} = useAnnouncementCollapse(
	collapseKey,
	() => props.projectId,
	() => announcement.value?.revision ?? 0,
)

// "Show all" is a per-visit choice; only the collapsed state persists.
const contentRef = ref<HTMLElement>()
const showAll = ref(false)
const overflowing = ref(false)

function measure() {
	const element = contentRef.value
	// Collapsed (display: none) or unclamped: nothing to measure, keep the last answer.
	if (!element || showAll.value || element.clientHeight === 0) return
	overflowing.value = element.scrollHeight > element.clientHeight + 1
}

useResizeObserver(contentRef, () => measure())

watch(html, async () => {
	showAll.value = false
	await nextTick()
	measure()
})

// A link tabbed to inside the clamped part would be focused out of sight.
function revealFocused() {
	if (!showAll.value && overflowing.value) {
		showAll.value = true
	}
}
</script>

<style lang="scss" scoped>
// A card with a leading accent rule like Message, on an opaque surface so it stays legible over
// project backgrounds; the icon and heading, not the colour, say what it is.
.project-announcement {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
	min-inline-size: 0;
	padding: var(--space-2) var(--space-3);
	border: 1px solid var(--border-subtle);
	border-inline-start: 3px solid var(--primary);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
	color: var(--text-primary);
	overflow-wrap: anywhere;
}

.project-announcement__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-2);
	min-inline-size: 0;
}

.project-announcement__icon {
	flex-shrink: 0;
	color: var(--accent-text);
}

.project-announcement__title {
	flex: 1 1 12rem;
	min-inline-size: 0;
	margin: 0;
	color: var(--text-primary);
	font-size: var(--text-md);
	font-weight: var(--weight-semibold);
	line-height: 1.4;

	.is-collapsed & {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.project-announcement__meta {
	margin: 0;
	color: var(--text-secondary);
	font-size: var(--text-xs);
	white-space: nowrap;
}

.project-announcement__actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-1);
	margin-inline-start: auto;

	// .button outranks Button.vue's own .button.is-small height.
	.project-announcement__action.button {
		@media (pointer: coarse) {
			min-block-size: var(--target-min);
		}
	}
}

// Indented past the icon so the text lines up under the heading.
.project-announcement__body {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--space-1);
	min-inline-size: 0;
	padding-inline-start: calc(1em + var(--space-2));
}

.project-announcement__content {
	inline-size: 100%;
	min-inline-size: 0;
	color: var(--text-primary);
	font-size: var(--text-md);
	line-height: 1.5;

	// About six lines; "Show all" lifts it.
	&.is-clamped {
		max-block-size: 9em;
		overflow: hidden;
	}

	&.is-overflowing {
		mask-image: linear-gradient(to bottom, #000000 calc(100% - 1.5em), transparent);
	}

	// The markup comes from v-html, so it only matches through :deep().
	:deep(:where(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6)) {
		margin-block: 0 var(--space-2);
	}

	> :deep(:last-child) {
		margin-block-end: 0;
	}

	:deep(:where(h1, h2, h3, h4, h5, h6)) {
		color: var(--text-primary);
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		line-height: 1.4;
	}

	:deep(:where(h1, h2)) {
		font-size: var(--text-lg);
	}

	:deep(:where(ul, ol)) {
		padding-inline-start: 1.5em;
	}

	:deep(ul) {
		list-style: disc;
	}

	:deep(ol) {
		list-style: decimal;
	}

	:deep(ul[data-type="taskList"]) {
		list-style: none;
		padding-inline-start: 0;
	}

	:deep(li > p) {
		margin-block-end: 0;
	}

	:deep(a) {
		color: var(--accent-text);
		text-decoration: underline;
		text-underline-offset: .15em;
	}

	:deep(code) {
		padding-inline: .25em;
		border-radius: var(--radius-xs);
		background: var(--surface-sunken);
		font-size: .92em;
	}

	:deep(pre) {
		max-inline-size: 100%;
		overflow-x: auto;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		white-space: pre-wrap;

		code {
			padding: 0;
			background: none;
		}
	}

	:deep(blockquote) {
		padding-inline-start: var(--space-3);
		border-inline-start: 3px solid var(--border-strong);
		color: var(--text-secondary);
	}

	// Wide tables scroll inside themselves instead of widening the page.
	:deep(table) {
		display: block;
		max-inline-size: 100%;
		overflow-x: auto;
		border-collapse: collapse;
		overflow-wrap: normal;
	}

	:deep(:where(th, td)) {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-subtle);
		text-align: start;
		vertical-align: top;
	}

	:deep(hr) {
		block-size: 0;
		margin-block: var(--space-2);
		border: 0;
		border-block-start: 1px solid var(--border-subtle);
		background: none;
	}

	:deep(mark) {
		background: var(--tint-warning);
		color: inherit;
	}
}

.project-announcement__more {
	padding-block: var(--space-1);
	border-radius: var(--radius-xs);
	color: var(--accent-text);
	font-size: var(--text-sm);
	font-weight: var(--weight-medium);

	&:hover {
		text-decoration: underline;
	}

	&:focus-visible {
		@include focus-ring;
	}

	@media (pointer: coarse) {
		min-block-size: var(--target-min);
	}
}

// One column: the heading gets its own row, meta and actions wrap under it.
@media screen and (max-width: $tablet) {
	.project-announcement__title {
		flex-basis: calc(100% - 1em - var(--space-2));
	}

	.project-announcement__meta {
		flex: 1 1 auto;
		white-space: normal;
	}

	.project-announcement__body {
		padding-inline-start: 0;
	}
}
</style>
