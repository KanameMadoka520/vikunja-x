<script setup lang="ts">
import {computed, onMounted, onBeforeUnmount, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useQuery} from '@tanstack/vue-query'
import {assistantPreferencesQuery, useSaveAssistantPreferences} from '@/client/queries/assistantPreferences'
import {aiSettingsQuery} from '@/client/queries/tcyAi'
import {builtinProfileIDs, normalizeOptions, profileOptions, validOptions, type AssistantOptions} from '@/helpers/assistantProfiles'
import {useProjects} from '@/composables/useProjects'
import type {AssistantPreferences} from '@/client/generated'
const props = defineProps<{options: AssistantOptions, profile: string}>()
const emit = defineEmits<{close: [], apply: [options: AssistantOptions, profile: string]}>()
const {t} = useI18n({useScope: 'global'})
const preferences = useQuery(assistantPreferencesQuery())
const settings = useQuery(aiSettingsQuery())
const save = useSaveAssistantPreferences()
const {projectsArray} = useProjects()
// A modal deliberately edits a snapshot; cancel must not change the parent.
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const draft = ref(normalizeOptions(props.options))
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const selected = ref(props.profile)
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const sourceProfile = ref(props.profile.startsWith('custom-') ? props.profile : '')
const name = ref('')
const error = ref('')
const saved = ref(false)
const dialog = ref<HTMLDialogElement>()
const previousFocus = document.activeElement as HTMLElement | null
const custom = computed(() => preferences.data.value?.profiles ?? [])
const unavailable = computed(() => draft.value.write_project_ids.filter(id => !projectsArray.some(p => p.id === id && !p.is_archived)))
const valid = computed(() => validOptions(draft.value))
const models = computed(() => settings.data.value?.connections.filter(c => c.kind === 'chat') ?? [])
const defaultID = computed(() => preferences.data.value?.default_profile || 'ask')
function choose(id: string) {
	selected.value = id
	const p = custom.value.find(p => p.id === id)
	draft.value = p ? normalizeOptions(p.options) : {...profileOptions(id), connection_id: draft.value.connection_id, project_id: draft.value.project_id}
	name.value = p?.name ?? ''
	sourceProfile.value = p?.id ?? ''
	saved.value = false
}
function edited() {selected.value = ''; saved.value = false}
async function persist(next: AssistantPreferences) {
	error.value = ''
	try {await save.mutateAsync(next); saved.value = true; return true} catch {error.value = t('assistantUI.saveFailed'); return false}
}
async function saveTemplate(overwrite = false) {
	if (!name.value.trim() || !valid.value || !preferences.data.value || (!overwrite && custom.value.length >= 20)) return
	const id = overwrite ? sourceProfile.value : `custom-${crypto.randomUUID()}`
	if (overwrite && !custom.value.some(p => p.id === id)) return
	const profile = {id, name: name.value.trim(), options: normalizeOptions(draft.value)}
	const profiles = overwrite ? custom.value.map(p => p.id === id ? profile : p) : [...custom.value, profile]
	if (await persist({...preferences.data.value, profiles})) {selected.value = id; sourceProfile.value = id}
}
async function setDefault() {
	if (!selected.value || !preferences.data.value) return
	await persist({...preferences.data.value, default_profile: selected.value})
}
async function removeTemplate() {
	if (!selected.value.startsWith('custom-') || !preferences.data.value) return
	const next = {...preferences.data.value, profiles: custom.value.filter(p => p.id !== selected.value)}
	if (next.default_profile === selected.value) next.default_profile = 'ask'
	if (await persist(next)) choose('ask')
}
function apply() {
	if (!valid.value || save.isPending.value) return
	emit('apply', normalizeOptions(draft.value), selected.value)
	emit('close')
}
onMounted(() => {name.value = custom.value.find(p => p.id === sourceProfile.value)?.name ?? ''; dialog.value?.showModal()})
onBeforeUnmount(() => {dialog.value?.close(); previousFocus?.focus()})
</script>

<template>
	<Teleport to="body">
		<dialog
			ref="dialog"
			class="assistant-preferences"
			:aria-label="t('assistantUI.preferences')"
			@cancel.prevent="emit('close')"
			@click="($event.target === dialog) && emit('close')"
		>
			<form
				class="preferences-body"
				@submit.prevent="apply"
			>
				<header>
					<div><h2>{{ t('assistantUI.preferences') }}</h2><p>{{ t('assistantUI.nextRequest') }}</p></div><button
						type="button"
						class="plain-button close-button"
						:aria-label="t('misc.close')"
						@click="emit('close')"
					>
						<Icon icon="times" />
					</button>
				</header>
				<div class="preferences-scroll">
					<section :aria-label="t('assistantUI.scenarios')">
						<h3>{{ t('assistantUI.scenarios') }}</h3>
						<div class="preset-grid">
							<button
								v-for="id in builtinProfileIDs"
								:key="id"
								type="button"
								class="preset"
								:class="{selected: selected === id}"
								:aria-pressed="selected === id"
								@click="choose(id)"
							>
								<strong>{{ t(`assistantUI.presets.${id}.name`) }}</strong><span>{{ t(`assistantUI.presets.${id}.description`) }}</span><small v-if="defaultID === id">{{ t('assistantUI.default') }}</small>
							</button>
						</div>
						<label v-if="custom.length">{{ t('assistantUI.myTemplates') }}<select
							class="input"
							:value="selected.startsWith('custom-') ? selected : ''"
							@change="choose(($event.target as HTMLSelectElement).value)"
						><option
							value=""
							disabled
						>{{ t('assistantUI.chooseTemplate') }}</option><option
							v-for="p in custom"
							:key="p.id"
							:value="p.id"
						>{{ p.name }}{{ defaultID === p.id ? ` · ${t('assistantUI.default')}` : '' }}</option></select></label>
						<div class="template-actions">
							<button
								type="button"
								:disabled="!selected || save.isPending.value || preferences.isPending.value"
								@click="setDefault"
							>
								{{ t('assistantUI.makeDefault') }}
							</button><button
								v-if="selected.startsWith('custom-')"
								type="button"
								:disabled="save.isPending.value"
								@click="removeTemplate"
							>
								{{ t('assistantUI.deleteTemplate') }}
							</button>
						</div>
						<p class="help">
							{{ t('assistantUI.defaultHelp') }}
						</p>
					</section>
					<section
						class="option-grid"
						@input="edited"
						@change="edited"
					>
						<label>{{ t('chat.model') }}<select
							v-model="draft.connection_id"
							class="input"
						><option value="">{{ t('chat.defaultModel') }}</option><option
							v-for="c in models"
							:key="c.id"
							:value="c.id"
						>{{ c.name }} · {{ c.model }}</option><option
							v-if="draft.connection_id && !models.some(c => c.id === draft.connection_id)"
							:value="draft.connection_id"
						>{{ t('assistantUI.missingModel') }} · {{ draft.connection_id }}</option></select></label>
						<label>{{ t('tcymc.text.current_project') }}<select
							v-model.number="draft.project_id"
							class="input"
						><option :value="0">{{ t('tcymc.text.all_accessible_projects') }}</option><option
							v-for="p in projectsArray.filter(p => p.id > 0 && !p.is_archived)"
							:key="p.id"
							:value="p.id"
						>{{ p.title }}</option><option
							v-if="draft.project_id && !projectsArray.some(p => p.id === draft.project_id && !p.is_archived)"
							:value="draft.project_id"
						>#{{ draft.project_id }} · {{ t('assistantUI.unavailableProject') }}</option></select><small>{{ t('assistantUI.contextHelp') }}</small></label>
						<label>{{ t('tcymc.text.working_mode') }}<select
							v-model="draft.mode"
							class="input"
							@change="draft.mode === 'read' && (draft.allow_delete = false)"
						><option value="read">{{ t('tcymc.text.read_only_look_up_tasks_and_suggest_changes') }}</option><option value="write">{{ t('tcymc.text.execute_allow_creation_and_changes') }}</option></select><small>{{ t('assistantUI.modeHelp') }}</small></label>
						<label>{{ t('agent.approvalPolicy') }}<select
							v-model="draft.approval"
							class="input"
							:disabled="draft.mode === 'read'"
						><option value="smart">{{ t('agent.smart') }}</option><option value="review">{{ t('agent.reviewAll') }}</option><option value="auto">{{ t('agent.auto') }}</option></select><small>{{ t(`assistantUI.approval_${draft.approval}`) }}</small></label>
						<label class="checkbox"><input
							v-model="draft.allow_delete"
							type="checkbox"
							:disabled="draft.mode === 'read'"
						>{{ t('tcymc.text.allow_task_deletion_for_this_request') }}</label>
						<fieldset
							class="project-scope"
							:disabled="draft.mode === 'read'"
						>
							<legend>{{ t('agent.writeScope') }}</legend><p class="help">
								{{ t('agent.scopeHelp') }}
							</p><div class="project-checks">
								<label
									v-for="p in projectsArray.filter(p => p.id > 0 && !p.is_archived)"
									:key="p.id"
									class="checkbox"
								><input
									v-model="draft.write_project_ids"
									type="checkbox"
									:value="p.id"
								>{{ p.title }}</label><label
									v-for="id in unavailable"
									:key="id"
									class="checkbox"
								><input
									v-model="draft.write_project_ids"
									type="checkbox"
									:value="id"
								>#{{ id }} · {{ t('assistantUI.unavailableProject') }}</label>
							</div>
						</fieldset>
					</section>
					<details class="advanced">
						<summary>{{ t('assistantUI.advanced') }}</summary><p class="help">
							{{ t('assistantUI.budgetHelp') }}
						</p><div
							class="option-grid"
							@input="edited"
						>
							<label
								v-for="field in (['max_rounds', 'max_operations', 'timeout_seconds', 'token_budget'] as const)"
								:key="field"
							>{{ t(`assistantUI.${field}`) }}<input
								v-model.number="draft[field]"
								class="input"
								type="number"
								required
								step="1"
								:min="field === 'token_budget' ? 0 : 1"
								:max="{max_rounds: 40, max_operations: 100, timeout_seconds: 600, token_budget: 1000000}[field]"
							><small>{{ t(`assistantUI.${field}Help`) }}</small></label>
						</div>
					</details>
					<section class="save-template">
						<label>{{ t('assistantUI.templateName') }}<input
							v-model="name"
							class="input"
							maxlength="80"
							:placeholder="t('assistantUI.nameExample')"
						></label><button
							type="button"
							:disabled="!name.trim() || !valid || custom.length >= 20 || preferences.isPending.value || save.isPending.value"
							@click="saveTemplate(false)"
						>
							{{ t('assistantUI.saveTemplate') }}
						</button><button
							v-if="sourceProfile && custom.some(p => p.id === sourceProfile)"
							type="button"
							:disabled="!name.trim() || !valid || save.isPending.value"
							@click="saveTemplate(true)"
						>
							{{ t('assistantUI.updateTemplate') }}
						</button><small>{{ t('assistantUI.templateHelp') }}</small>
					</section>
					<p
						v-if="saved"
						role="status"
					>
						{{ t('assistantUI.saved') }}
					</p><p
						v-if="error || preferences.isError.value"
						role="alert"
					>
						{{ error || t('assistantUI.loadFailed') }} <button
							type="button"
							@click="preferences.refetch()"
						>
							{{ t('chat.retry') }}
						</button>
					</p>
				</div>
				<footer>
					<RouterLink
						:to="{name: 'user.settings.ai'}"
						@click="emit('close')"
					>
						{{ t('tcymc.text.ai_and_voice_settings') }}
					</RouterLink><button
						type="button"
						@click="emit('close')"
					>
						{{ t('misc.cancel') }}
					</button><button
						class="apply-button"
						type="submit"
						:disabled="!valid || save.isPending.value"
					>
						{{ t('assistantUI.apply') }}
					</button>
				</footer>
			</form>
		</dialog>
	</Teleport>
</template>

<style scoped lang="scss">
.assistant-preferences {
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
color: var(--text);
background: var(--white);
border: 1px solid var(--grey-200);
border-radius: 1.25rem;
padding: 0;
inline-size: min(44rem, calc(100vw - 2rem));
max-block-size: calc(100dvh - 2rem);
overscroll-behavior: contain;
overflow: hidden;
box-shadow: 0 24px 80px #00000033;
}
.assistant-preferences::backdrop {
background: #00000066;
}
.preferences-body {
 display: flex;
 flex-direction: column;
 max-block-size: calc(100dvh - 2rem - 2px);
 padding: 0;
}
.preferences-scroll {
 flex: 1;
 min-block-size: 0;
 overflow-y: auto;
 padding: 0 1.5rem 1rem;
 overscroll-behavior: contain;
}
header {
 flex-shrink: 0;
 padding: 1.25rem 1.5rem .5rem;
display: flex;
justify-content: space-between;
gap: 1rem;
}
h2 {
font-family: inherit;
font-size: 1.35rem;
margin: 0 0 .5rem;
}
h3 {
font-size: 1rem;
margin: 0 0 .75rem;
}
header p, .help, small {
font-size: .8rem;
color: var(--text-light);
line-height: 1.6;
}
section, .advanced {
margin-block: 1.25rem;
}
label {
display: flex;
flex-direction: column;
gap: .5rem;
font-size: .9rem;
min-inline-size: 0;
}
.checkbox {
flex-direction: row;
align-items: center;
}
button {
cursor: pointer;
font: inherit;
color: inherit;
background: var(--grey-100);
border: 1px solid transparent;
border-radius: .65rem;
padding: .6rem .8rem;
}
button:disabled {
opacity: .45;
cursor: default;
}
button:hover:not(:disabled) {
background: var(--grey-200);
}
button:focus-visible {
outline: 2px solid var(--primary);
outline-offset: 2px;
}
.preset-grid, .option-grid {
display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 1rem;
}
.preset {
display: flex;
flex-direction: column;
gap: .5rem;
text-align: start;
background: transparent;
border-color: var(--grey-200);
}
.preset.selected {
border-color: var(--text);
background: var(--grey-100);
}
.preset span {
font-size: .8rem;
line-height: 1.6;
color: var(--text-light);
}
.template-actions {
display: flex;
gap: .5rem;
margin-block-start: .75rem;
}
.project-scope {
grid-column: 1 / -1;
padding: 0;
border: 0;
}
.project-checks {
display: flex;
flex-wrap: wrap;
gap: .75rem 1.25rem;
max-block-size: 10rem;
overflow-y: auto;
}
.advanced {
padding-block: 1rem;
border-block: 1px solid var(--grey-200);
}
summary {
cursor: pointer;
}
.save-template {
display: flex;
align-items: end;
flex-wrap: wrap;
gap: .75rem;
}
.save-template label {
flex: 1;
}
.save-template small {
flex-basis: 100%;
}
footer {
 display: flex;
 align-items: center;
 gap: .75rem;
 flex-wrap: wrap;
 flex-shrink: 0;
 padding: 1rem 1.5rem;
 background: var(--white);
 border-block-start: 1px solid var(--grey-200);
}
footer a {
margin-inline-end: auto;
font-size: .8rem;
}
.apply-button {
background: var(--text);
color: var(--white);
}
.close-button {
align-self: start;
background: transparent;
}
@media (width <= 540px) {
 .option-grid, .preset-grid { grid-template-columns: 1fr; }
 .preferences-scroll { padding-inline: 1rem; }
 header, footer { padding-inline: 1rem; }
 footer a { flex-basis: 100%; }
}
</style>
