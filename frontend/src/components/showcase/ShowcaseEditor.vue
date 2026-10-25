<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const props = defineProps<{initial: TcyShowcaseSettingsResponse}>()
const {t} = useI18n({useScope: 'global'})
import {computed, ref} from 'vue'
import {useProjects} from '@/composables/useProjects'
import {normalizeDraft, useSaveShowcase, usePreviewShowcase, usePublishShowcase, useUnpublishShowcase} from '@/client/queries/tcyShowcase'
import type {TcyShowcaseSettingsResponse, TcyShowcasePreviewResponse} from '@/client/generated'
import ShowcasePage from './ShowcasePage.vue'

function seed() { return normalizeDraft(props.initial.draft) }
const draft = ref(seed())
const {projectsArray} = useProjects()
const save = useSaveShowcase()
const previewMutation = usePreviewShowcase()
const publish = usePublishShowcase()
const unpublish = useUnpublishShowcase()
const preview = ref<TcyShowcasePreviewResponse>()
const previewFingerprint = ref('')
const selectedProject = ref(0)
const busy = computed(() => save.isPending.value || previewMutation.isPending.value || publish.isPending.value || unpublish.isPending.value)
const readyToPublish = computed(() => Boolean(preview.value) && previewFingerprint.value === JSON.stringify(draft.value))
const publicURL = computed(() => `${window.location.origin}/p/${props.initial.published?.slug ?? draft.value.slug}`)
const jsonURL = computed(() => `${window.location.origin}/api/v2/public/${props.initial.published?.slug ?? draft.value.slug}`)
const weekdays = computed(() => [t('tcymc.text.sun'), t('tcymc.text.mon'), t('tcymc.text.tue'), t('tcymc.text.wed'), t('tcymc.text.thu'), t('tcymc.text.fri'), t('tcymc.text.sat')])

function addProject() {
	if (!selectedProject.value || draft.value.projects.some(p => p.id === selectedProject.value)) return
	draft.value.projects.push({id: selectedProject.value, alias: '', mode: 'busy'})
}

function taskRule(id: number) {
	let rule = draft.value.tasks.find(t => t.id === id)
	if (!rule) { rule = {id, alias: '', hidden: false}; draft.value.tasks.push(rule) }
	return rule
}

async function showPreview() {
	try {
		const current = JSON.stringify(draft.value)
		preview.value = await previewMutation.mutateAsync(JSON.parse(current))
		previewFingerprint.value = current
	} catch { return }
}

async function saveDraft() { try { await save.mutateAsync(draft.value) } catch { return } }
async function publishDraft() { if (!readyToPublish.value) return; try { await publish.mutateAsync(draft.value) } catch { return } }
async function takeDown() { try { await unpublish.mutateAsync() } catch { return } }

function insertTemplate() {
	draft.value.content = t('tcymc.text.welcome_to_my_schedule_here_are_the_plans')
	draft.value.format = 'markdown'
}
</script>

<template>
	<div class="showcase-editor">
		<header><h2><Icon icon="globe" /> {{ t('tcymc.text.public_page') }}</h2><p>{{ t('tcymc.text.share_a_separate_public_schedule_with_friends_and') }}</p></header>
		<div
			class="publication"
			data-tour="showcase-status"
		>
			<strong>{{ initial.published ? t('tcymc.text.published') : t('tcymc.text.not_published') }}</strong><template v-if="initial.published">
				<a
					:href="publicURL"
					target="_blank"
					rel="noopener noreferrer"
				>{{ t('tcymc.text.view_public_page') }}</a><a
					:href="jsonURL"
					target="_blank"
					rel="noopener noreferrer"
				>{{ t('tcymc.text.json_endpoint_for_bots') }}</a><XButton
					variant="secondary"
					:disabled="busy"
					@click="takeDown"
				>
					{{ t('tcymc.text.take_down_page') }}
				</XButton>
			</template>
		</div>
		<section class="editor-panel">
			<h3 data-tour="showcase-hours">
				<Icon icon="calendar" /> {{ t('tcymc.text.page_and_available_hours') }}
			</h3><div class="fields">
				<label>{{ t('tcymc.text.page_address') }}<input
					v-model="draft.slug"
					class="input"
					pattern="[a-z0-9][a-z0-9-]{2,47}"
					:placeholder="t('tcymc.text.for_example_tcy')"
				><small>/p/{{ draft.slug || 'your-name' }}{{ t('tcymc.text.3_48_lowercase_letters_numbers_or_hyphens') }}</small></label><label>{{ t('tcymc.text.page_title') }}<input
					v-model="draft.title"
					class="input"
					maxlength="100"
				></label><label>{{ t('tcymc.text.days_to_show') }}<input
					v-model.number="draft.days"
					class="input"
					type="number"
					min="1"
					max="31"
				></label><label>{{ t('tcymc.text.daily_start_hour') }}<input
					v-model.number="draft.start_hour"
					class="input"
					type="number"
					min="0"
					max="23"
				></label><label>{{ t('tcymc.text.daily_end_hour') }}<input
					v-model.number="draft.end_hour"
					class="input"
					type="number"
					min="1"
					max="24"
				></label>
			</div><label>{{ t('tcymc.text.about_me') }}<textarea
				v-model="draft.intro"
				class="textarea"
				rows="2"
				maxlength="500"
			/></label><div class="weekdays">
				<label
					v-for="(day, index) in weekdays"
					:key="index"
				><input
					v-model="draft.weekdays"
					type="checkbox"
					:value="index"
				>{{ day }}</label>
			</div><p class="help">
				{{ t('tcymc.text.times_use_asia_shanghai_only_tasks_with_start') }}
			</p>
		</section>
		<section class="editor-panel">
			<h3 data-tour="showcase-projects">
				<Icon icon="eye" /> {{ t('tcymc.text.projects_to_publish') }}
			</h3><p>{{ t('tcymc.text.projects_not_added_here_stay_private_by_default') }}</p><div class="actions">
				<select
					v-model.number="selectedProject"
					class="input"
				>
					<option :value="0">
						{{ t('tcymc.text.select_a_project') }}
					</option><option
						v-for="project in projectsArray.filter(p => p.id > 0 && !p.is_archived)"
						:key="project.id"
						:value="project.id"
					>
						{{ project.title }}
					</option>
				</select><XButton
					variant="secondary"
					@click="addProject"
				>
					{{ t('tcymc.text.add_project_rule') }}
				</XButton>
			</div><div
				v-for="rule in draft.projects"
				:key="rule.id"
				class="project-rule"
			>
				<strong>{{ projectsArray.find(p => p.id === rule.id)?.title ?? t('tcymc.projectID', {id: rule.id}) }}</strong><label>{{ t('tcymc.text.public_name') }}<input
					v-model="rule.alias"
					class="input"
					:placeholder="t('tcymc.text.leave_blank_to_show_private_project')"
				></label><label>{{ t('tcymc.text.visibility') }}<select
					v-model="rule.mode"
					class="input"
				><option value="busy">{{ t('tcymc.text.show_busy_times_without_task_names') }}</option><option value="titles">{{ t('tcymc.text.show_task_titles_with_optional_public_names_below') }}</option><option value="hidden">{{ t('tcymc.text.hide_completely_and_exclude_from_availability') }}</option></select></label><XButton
					variant="tertiary"
					@click="draft.projects = draft.projects.filter(p => p.id !== rule.id)"
				>
					{{ t('tcymc.text.remove') }}
				</XButton>
			</div>
		</section>
		<section class="editor-panel">
			<h3 data-tour="showcase-content">
				<Icon icon="code" /> {{ t('tcymc.text.custom_markdown_or_html') }}
			</h3><label><input
				v-model="draft.custom_layout"
				type="checkbox"
			>{{ t('tcymc.text.use_a_custom_page_body_and_hide_the') }}</label><div class="actions">
				<select
					v-model="draft.format"
					class="input"
				>
					<option value="markdown">
						Markdown
					</option><option value="html">
						{{ t('tcymc.text.static_html_with_optional_css') }}
					</option>
				</select><XButton
					variant="secondary"
					@click="insertTemplate"
				>
					{{ t('tcymc.text.insert_schedule_template') }}
				</XButton>
			</div><textarea
				v-model="draft.content"
				class="textarea template-editor"
				rows="10"
				maxlength="80000"
				:placeholder="t('tcymc.text.write_an_introduction_or_insert_your_public_schedule')"
			/><p
				class="help"
				v-text="t('tcymc.placeholderHelp', {schedule: '{{schedule}}', availability: '{{availability}}', projects: '{{projects}}'})"
			/>
		</section>
		<section
			v-if="preview?.sources?.length"
			class="editor-panel"
		>
			<h3>{{ t('tcymc.text.public_names_and_visibility_for_individual_tasks') }}</h3><p>{{ t('tcymc.text.original_names_below_are_only_visible_to_you') }}</p><div
				v-for="task in preview.sources"
				:key="task.id"
				class="task-rule"
			>
				<strong>{{ task.title }}</strong><input
					class="input"
					:value="draft.tasks.find(t => t.id === task.id)?.alias ?? ''"
					:placeholder="t('tcymc.text.public_name_leave_blank_to_use_project_rules')"
					@input="taskRule(task.id!).alias = ($event.target as HTMLInputElement).value"
				><label><input
					type="checkbox"
					:checked="draft.tasks.find(t => t.id === task.id)?.hidden ?? false"
					@change="taskRule(task.id!).hidden = ($event.target as HTMLInputElement).checked"
				>{{ t('tcymc.text.hide_completely') }}</label>
			</div>
		</section>
		<div class="actions">
			<XButton
				variant="secondary"
				:disabled="busy"
				icon="save"
				@click="saveDraft"
			>
				{{ t('tcymc.text.save_draft') }}
			</XButton><XButton
				variant="secondary"
				:disabled="busy"
				icon="eye"
				data-tour="showcase-preview"
				@click="showPreview"
			>
				{{ t('tcymc.text.preview_public_page') }}
			</XButton><XButton
				variant="primary"
				:disabled="busy || !readyToPublish"
				icon="globe"
				data-tour="showcase-publish"
				@click="publishDraft"
			>
				{{ t('tcymc.text.publish_this_preview') }}
			</XButton>
		</div><p class="help">
			{{ t('tcymc.text.preview_before_publishing_the_schedule_stays_up_to') }}
		</p>
		<section
			v-if="preview?.page"
			class="preview-panel"
		>
			<h3>{{ t('tcymc.text.what_visitors_will_see') }}</h3><p
				v-if="!readyToPublish"
				class="help"
			>
				{{ t('tcymc.text.the_draft_has_changed_preview_it_again_before') }}
			</p><ShowcasePage :page="preview.page" />
		</section>
	</div>
</template>

<style scoped>
.showcase-editor {
	display: grid;
	gap: 1.25rem;
}
h2 {
	font-size: 1.8rem;
	margin-block-end: .75rem;
}
h3 {
	font-size: 1.15rem;
	margin-block-end: .75rem;
}
.editor-panel, .preview-panel {
	padding: 1.25rem;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	background: var(--white);
}
.fields {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 1rem;
}
label {
	display: grid;
	gap: .4rem;
	margin-block: .5rem;
	font-size: .9rem;
}
.help, small {
	font-size: .8rem;
	color: var(--grey-600);
	margin-block-start: .75rem;
}
.publication, .actions, .weekdays {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 1rem;
}
.actions > select {
	inline-size: auto;
	max-inline-size: 100%;
}
.weekdays label {
	display: flex;
	gap: .25rem;
}
.project-rule, .task-rule {
	display: grid;
	gap: .75rem;
	padding-block: 1rem;
	border-block-end: 1px solid var(--grey-200);
}
.template-editor {
	margin-block-start: 1rem;
	font-family: monospace;
}
@media (width <= 600px) {
	.editor-panel, .preview-panel {
		padding: .75rem;
		min-inline-size: 0;
	}
	.fields {
		grid-template-columns: minmax(0, 1fr);
	}
	.actions {
		align-items: stretch;
	}
	.actions > * {
		flex: 1 1 auto;
		inline-size: 100%;
	}
	.project-rule, .task-rule {
		min-inline-size: 0;
	}
}
</style>
