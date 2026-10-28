<script setup lang="ts">
import {useEventListener} from '@vueuse/core'
import ModelPicker from './ModelPicker.vue'
import WebSearchEvidence from './WebSearchEvidence.vue'
import type {WebSearchResult} from '@/client/generated'
import {useI18n} from 'vue-i18n'
const props = defineProps<{initial: AISettings}>()
const {t} = useI18n({useScope: 'global'})
import {audioChatFile} from '@/helpers/tcyAudio'
import {computed, ref, watch} from 'vue'
import type {AIConnection, AISettings} from '@/client/queries/tcyAi'
import {useFetchAIModels, useSaveAISettings, useTestAIConnection} from '@/client/queries/tcyAi'
import type {ListedModel} from '@/client/generated'
import {isRequestContextAbort} from '@/client/requestContext'

type Settings = AISettings
function initialDraft(source = props.initial): Settings { return {
	connections: source.connections.map(c => ({...c, input_types: [...(c.input_types ?? [])], output_token_field: c.output_token_field ?? '', web_search_protocol: c.web_search_protocol || '', web_search_base_url: c.web_search_base_url || '', web_search_model: c.web_search_model || '', api_key: ''})),
	assistant: source.assistant,
	persona: source.persona || 'arona',
	transcription: source.transcription,
	cleanup: source.cleanup,
} }
const draft = ref<Settings>(initialDraft())
const baseline = ref(JSON.stringify(initialDraft()))
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const saveError = ref('')
const activeTab = ref<'chat' | 'transcription' | 'roles'>('chat')
useEventListener(window, 'vikunja:ai-settings-tab', (event: Event) => {
	const tab = (event as CustomEvent).detail
	if (['chat', 'transcription', 'roles'].includes(tab)) activeTab.value = tab
})
const visibleConnections = computed(() => draft.value.connections.filter(c => c.kind === activeTab.value))
const savingPart = ref('')
const cardErrors = ref<Record<string, string>>({})
const savedCards = ref<Record<string, string>>({})
function cardStamp(c: AIConnection) { return JSON.stringify(c) }
function persisted(id: string) { return props.initial.connections.some(c => c.id === id) }

watch(() => props.initial, () => {
	if (dirty.value) return
	draft.value = initialDraft()
	baseline.value = JSON.stringify(draft.value)
})
const save = useSaveAISettings()
const test = useTestAIConnection()
const testResult = ref('')
const modelFetcher = useFetchAIModels()
const modelLists = ref<Record<string, {models: string[], details: ListedModel[], fingerprint: string}>>({})
const modelNotice = ref<Record<string, string>>({})
const endpointResult = ref('')
const chatModels = computed(() => draft.value.connections.filter(c => c.kind === 'chat'))
const speechModels = computed(() => draft.value.connections.filter(c => c.kind === 'transcription'))
const testAudio = ref<File>()

const searchTest = useTestAIConnection()
const searchResults = ref<Record<string, WebSearchResult>>({})
const searchErrors = ref<Record<string, string>>({})
const searchStamps = ref<Record<string, string>>({})
const searchProtocols = {'': '', deepseek: 'DeepSeek Search API', 'openai-responses': 'OpenAI Responses · web_search', 'openai-chat': 'OpenAI Chat · web_search_options', anthropic: 'Anthropic · web_search_20250305', gemini: 'Gemini · Google Search'}
function searchFingerprint(c: AIConnection) { return JSON.stringify([c.base_url, c.model, c.api_key, c.web_search_protocol, c.web_search_base_url, c.web_search_model, c.non_streaming, c.max_output_tokens]) }
function searchEndpoint(c: AIConnection) {
	const base = c.web_search_base_url?.trim().replace(/\/+$/, '') || (c.web_search_protocol === 'deepseek' && isOfficialDeepSeek(c) ? 'https://api.deepseek.com/v1' : c.base_url.trim().replace(/\/+$/, ''))
	if (c.web_search_protocol === 'deepseek') return base + '/tools/search'
	return endpoint({...c, base_url: base, protocol: c.web_search_protocol || 'openai-chat', model: c.web_search_model || c.model})
}
async function testSearch(c: AIConnection) {
	if (searchTest.isPending.value) return
	const stamp = searchFingerprint(c)
	delete searchResults.value[c.id]; delete searchErrors.value[c.id]
	searchStamps.value[c.id] = stamp
	try {
		const result = await searchTest.mutateAsync({connection_id: c.id, web_search: true, connection: {...c}})
		if (stamp === searchFingerprint(c) && result.search) searchResults.value[c.id] = result.search
	} catch (e) { if (isRequestContextAbort(e)) return; if (stamp === searchFingerprint(c)) searchErrors.value[c.id] = e instanceof Error ? e.message : t('webSearch.failed') }
}

function addConnection() {
	draft.value.connections.push({id: crypto.randomUUID(), name: '', base_url: '', model: '', kind: activeTab.value === 'transcription' ? 'transcription' : 'chat', protocol: activeTab.value === 'transcription' ? 'openai-transcription' : 'openai-chat', context_window: 0, max_output_tokens: 0, input_types: [], output_token_field: '', web_search_protocol: '', web_search_base_url: '', web_search_model: '', api_key: '', has_key: false})
}

function savePayload(settings: Settings) {
	return {...settings, connections: settings.connections.map(c => ({web_search_protocol: c.web_search_protocol, web_search_base_url: c.web_search_base_url, web_search_model: c.web_search_model, id: c.id, name: c.name, kind: c.kind, protocol: c.protocol, base_url: c.base_url, model: c.model, api_key: c.api_key, non_streaming: c.non_streaming, context_window: c.context_window || 0, max_output_tokens: c.max_output_tokens || 0, input_types: c.input_types, output_token_field: c.output_token_field}))}
}
async function saveConnection(connection: AIConnection) {
	if (save.isPending.value) return
	const id = connection.id
	const submitted = cardStamp(connection)
	const payload = initialDraft()
	const index = payload.connections.findIndex(c => c.id === id)
	if (index < 0) payload.connections.push({...connection})
	else payload.connections[index] = {...connection}
	// A changed connection purpose must not leave incompatible role assignments.
	for (const role of ['assistant', 'cleanup', 'transcription'] as const) {
		if (payload[role] === id && connection.kind !== (role === 'transcription' ? 'transcription' : 'chat')) payload[role] = ''
	}
	savingPart.value = id; cardErrors.value[id] = ''; delete savedCards.value[id]
	try {
		const saved = initialDraft(await save.mutateAsync(savePayload(payload)))
		const currentIndex = draft.value.connections.findIndex(c => c.id === id)
		const clean = saved.connections.find(c => c.id === id)!
		if (currentIndex >= 0 && cardStamp(draft.value.connections[currentIndex]) === submitted) {
			draft.value.connections[currentIndex] = clean
			savedCards.value[id] = cardStamp(clean)
		}
		baseline.value = JSON.stringify(saved)
	} catch (error) {
		if (!isRequestContextAbort(error)) cardErrors.value[id] = error instanceof Error ? error.message : t('settingsDraft.failed')
	} finally { savingPart.value = '' }
}
async function removeConnection(id: string) {
	if (save.isPending.value) return
	if (persisted(id)) {
		if (!window.confirm(t('modelSettings.removeConfirm'))) return
		const payload = initialDraft()
		payload.connections = payload.connections.filter(c => c.id !== id)
		for (const role of ['assistant', 'transcription', 'cleanup'] as const) if (payload[role] === id) payload[role] = ''
		savingPart.value = id; cardErrors.value[id] = ''
		try { baseline.value = JSON.stringify(initialDraft(await save.mutateAsync(savePayload(payload)))) }
		catch (error) { if (!isRequestContextAbort(error)) cardErrors.value[id] = error instanceof Error ? error.message : t('settingsDraft.failed'); return }
		finally { savingPart.value = '' }
	}
	draft.value.connections = draft.value.connections.filter(c => c.id !== id)
	for (const role of ['assistant', 'transcription', 'cleanup'] as const) if (draft.value[role] === id) draft.value[role] = ''
}
async function saveRoles() {
	if (save.isPending.value) return
	saveError.value = ''
	const roles = {assistant: draft.value.assistant, transcription: draft.value.transcription, cleanup: draft.value.cleanup, persona: draft.value.persona}
	const payload = {...initialDraft(), ...roles}
	if ([roles.assistant, roles.transcription, roles.cleanup].some(id => id && !payload.connections.some(c => c.id === id))) {
		saveError.value = t('modelSettings.saveConnectionFirst'); return
	}
	savingPart.value = 'roles'
	try {
		const clean = initialDraft(await save.mutateAsync(savePayload(payload)))
		for (const role of ['assistant', 'transcription', 'cleanup'] as const) if (draft.value[role] === roles[role]) draft.value[role] = clean[role]
		baseline.value = JSON.stringify(clean)
	} catch (error) { if (!isRequestContextAbort(error)) saveError.value = error instanceof Error ? error.message : t('settingsDraft.failed') }
	finally { savingPart.value = '' }
}

async function testConnection(id: string, kind: string) {
	testResult.value = ''
	endpointResult.value = ''
	let audio = ''
	let filename = testAudio.value?.name ?? 'audio.webm'
	if (kind === 'transcription') {
		if (!testAudio.value) { testResult.value = t('tcymc.text.choose_an_audio_file_for_testing_first'); return }
		if (testAudio.value.size > 16 * 1024 * 1024) { testResult.value = t('tcymc.text.test_audio_must_not_exceed_16_mib'); return }
		let file: Blob = testAudio.value
		if (draft.value.connections.find(c => c.id === id)?.protocol === 'openai-audio') {
			try { const converted = await audioChatFile(file, filename); file = converted.file; filename = converted.filename }
			catch { testResult.value = t('tcymc.audioConversionFailed'); return }
		}
		audio = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result).split(',')[1])
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
	}
	try {
		const result = await test.mutateAsync({connection_id: id, audio, filename})
		testResult.value = [result.text, result.warning].filter(Boolean).join('\n')
		endpointResult.value = result.endpoint ?? ''
	} catch (e) { if (isRequestContextAbort(e)) return; testResult.value = e instanceof Error ? e.message : t('tcymc.text.connection_test_failed_check_the_url_key_model') }
}

function protocols(kind: string) {
	return kind === 'transcription' ? ['openai-transcription', 'openai-audio', 'gemini'] as const : ['openai-chat', 'openai-responses', 'anthropic', 'gemini'] as const
}
const protocolNames = {'openai-chat': 'OpenAI Chat Completions', 'openai-responses': 'OpenAI Responses', anthropic: 'Anthropic Messages', gemini: 'Gemini generateContent', 'openai-transcription': 'OpenAI Audio Transcriptions', 'openai-audio': 'OpenAI Chat Audio'}
function changeKind(c: AIConnection) {
	c.protocol = c.kind === 'chat' ? 'openai-chat' : 'openai-transcription'
	if (c.kind !== 'chat') c.web_search_protocol = ''
	activeTab.value = c.kind
	for (const role of ['assistant', 'cleanup', 'transcription'] as const) if (draft.value[role] === c.id && c.kind !== (role === 'transcription' ? 'transcription' : 'chat')) draft.value[role] = ''
}
function endpoint(c: AIConnection, models = false) {
	const base = c.base_url.trim().replace(/\/+$/, '')
	if (!base) return t('tcymc.text.enter_a_base_url_to_see_the_endpoint')
	const paths = {'openai-chat': '/chat/completions', 'openai-responses': '/responses', anthropic: '/messages', 'openai-transcription': '/audio/transcriptions', 'openai-audio': '/chat/completions', gemini: `/models/${encodeURIComponent(c.model.replace(/^models\//, '') || '{model}')}:generateContent`}
	if (models && isOfficialDeepSeek(c)) return 'https://api.deepseek.com/models'
	return base + (models ? '/models' : c.protocol === 'gemini' && !c.non_streaming ? paths.gemini.replace(':generateContent', ':streamGenerateContent?alt=sse') : paths[c.protocol])
}
function fingerprint(c: AIConnection) { return JSON.stringify([c.base_url, c.protocol, c.kind]) }
function loadedModels(c: AIConnection) { const saved = modelLists.value[c.id]; return saved?.fingerprint === fingerprint(c) ? saved.models : [] }
async function fetchModels(c: AIConnection) {
	const stamp = fingerprint(c)
	try {
		const result = await modelFetcher.mutateAsync({id: c.id, base_url: c.base_url, protocol: c.protocol, kind: c.kind, api_key: c.api_key})
		if (stamp !== fingerprint(c)) return
		modelLists.value[c.id] = {models: result.models ?? [], details: result.details ?? [], fingerprint: stamp}
		modelNotice.value[c.id] = result.truncated ? t('tcymc.text.the_provider_has_many_models_only_the_first') : result.models?.length ? t('tcymc.text.model_list_updated_you_can_also_enter_a') : t('tcymc.text.the_provider_returned_no_models_enter_a_model')
	} catch (e) { if (isRequestContextAbort(e)) return; modelNotice.value[c.id] = t('tcymc.text.could_not_fetch_models_some_providers_do_not') }
}
function isOfficialDeepSeek(c: AIConnection) {
	try { const url = new URL(c.base_url); return url.protocol === 'https:' && url.hostname === 'api.deepseek.com' && (!url.port || url.port === '443') } catch { return false }
}
function listedModel(c: AIConnection) {
	const list = modelLists.value[c.id]
	return list?.fingerprint === fingerprint(c) ? list.details.find(m => m.id === c.model) : undefined
}
function applyCapabilities(c: AIConnection) {
	const model = listedModel(c)
	if (!model) return
	if (model.context_window) c.context_window = model.context_window
	if (model.max_output_tokens) c.max_output_tokens = model.max_output_tokens
	if (model.input_types?.length) c.input_types = [...model.input_types]
}
function capabilityKey(c: AIConnection) { return JSON.stringify([c.context_window || 0, c.max_output_tokens || 0, c.input_types ?? [], c.output_token_field || '']) }
function changeInputTypes(c: AIConnection, event: Event) {
	const value = (event.target as HTMLSelectElement).value
	c.input_types = value ? value.split(',') : []
}
function changedAddress(c: AIConnection) {
	const previous = props.initial.connections.find(s => s.id === c.id)
	return previous?.has_key && previous.base_url.replace(/\/+$/, '') !== c.base_url.trim().replace(/\/+$/, '') && !c.api_key
}
function savedMatches(c: AIConnection) {
	const saved = props.initial.connections.find(s => s.id === c.id)
	return saved && saved.base_url === c.base_url && saved.model === c.model && saved.protocol === c.protocol && saved.kind === c.kind && Boolean(saved.non_streaming) === Boolean(c.non_streaming) && capabilityKey(saved) === capabilityKey(c) && !c.api_key
}
</script>

<template>
	<div class="tcy-settings">
		<header>
			<p class="eyebrow">
				VIKUNJA X
			</p>
			<h2><Icon icon="robot" /> {{ t('tcymc.text.ai_and_voice') }}</h2>
			<p>{{ t('tcymc.text.connect_your_own_models_and_choose_one_for') }}</p>
		</header>
		<p
			v-if="dirty"
			role="status"
		>
			{{ t('settingsDraft.unsaved') }}
		</p>

		<nav
			class="model-tabs"
			:aria-label="t('modelSettings.tabs')"
		>
			<button
				v-for="tab in (['chat', 'transcription', 'roles'] as const)"
				:key="tab"
				type="button"
				:class="{'is-selected': activeTab === tab}"
				:aria-pressed="activeTab === tab"
				@click="activeTab = tab"
			>
				{{ t(`modelSettings.${tab}`) }}<span v-if="tab !== 'roles'">{{ draft.connections.filter(c => c.kind === tab).length }}</span>
			</button>
		</nav>
		<section
			v-show="activeTab !== 'roles'"
			class="tcy-panel"
		>
			<h3 data-tour="ai-connections">
				<Icon icon="link" /> {{ t('tcymc.text.model_connections') }}
			</h3>
			<p>{{ t('tcymc.text.choose_your_provider_s_protocol_and_include_its') }}</p>
			<p
				v-if="!visibleConnections.length"
				class="empty"
			>
				{{ t('tcymc.text.no_connections_yet_add_one_then_assign_it') }}
			</p>
			<form
				v-for="(connection, index) in visibleConnections"
				:key="connection.id"
				class="connection"
				@submit.prevent="saveConnection(connection)"
			>
				<h4>{{ t('tcymc.text.connection') }} {{ index + 1 }} · {{ connection.name || t('tcymc.text.new_model') }}</h4>
				<p
					v-if="changedAddress(connection)"
					class="notification is-warning"
				>
					{{ t('mailServer.keyChange') }}
				</p>
				<div class="fields">
					<label>{{ t('tcymc.text.connection_name') }}<input
						v-model="connection.name"
						class="input"
						required
						maxlength="100"
						:placeholder="t('tcymc.text.for_example_my_task_assistant')"
					></label>
					<label>{{ t('tcymc.text.connection_purpose') }}<select
						v-model="connection.kind"
						class="input"
						@change="changeKind(connection)"
					><option value="chat">{{ t('tcymc.text.text_chat_and_tool_calling') }}</option><option value="transcription">{{ t('tcymc.text.speech_recognition_and_transcription') }}</option></select></label>
					<label>{{ t('tcymc.text.request_protocol') }}<select
						v-model="connection.protocol"
						class="input"
					><option
						v-for="protocol in protocols(connection.kind)"
						:key="protocol"
						:value="protocol"
					>{{ protocolNames[protocol] }}</option></select></label>
					<label>{{ t('tcymc.text.api_base_url') }}<input
						v-model="connection.base_url"
						class="input"
						required
						type="url"
						placeholder="https://api.example.com/v1"
						autocomplete="off"
					></label>
					<ModelPicker
						v-model="connection.model"
						:models="loadedModels(connection)"
						:label="t('tcymc.text.model_id')"
						:placeholder="t('tcymc.text.model_name_provided_by_your_service')"
						required
					/>
					<label>{{ t('tcymc.apiKey') }}<input
						v-model="connection.api_key"
						class="input"
						type="password"
						autocomplete="new-password"
						:placeholder="initial.connections.some(c => c.id === connection.id && c.has_key) ? t('tcymc.text.saved_leave_blank_to_keep_the_current_key') : t('tcymc.text.enter_a_key_leave_blank_only_if_the')"
					></label>
				</div>
				<details
					v-if="connection.kind === 'chat'"
					class="model-options"
				>
					<summary>{{ t('webSearch.title') }} · {{ connection.web_search_protocol ? t('webSearch.enabled') : t('webSearch.disabled') }}</summary>
					<p>{{ t('webSearch.help') }}</p>
					<div class="fields">
						<label>{{ t('webSearch.protocol') }}<select
							v-model="connection.web_search_protocol"
							:aria-label="t('webSearch.protocol')"
							class="input"
						><option
							v-for="(name, key) in searchProtocols"
							:key="key"
							:value="key"
						>{{ key ? name : t('webSearch.disabled') }}</option></select></label>
						<template v-if="connection.web_search_protocol">
							<label>{{ t('webSearch.base') }}<input
								v-model="connection.web_search_base_url"
								:aria-label="t('webSearch.base')"
								class="input"
								type="url"
								:placeholder="t('webSearch.inheritBase')"
							><small>{{ t('webSearch.baseHelp') }}</small></label>
							<div v-if="connection.web_search_protocol !== 'deepseek'">
								<ModelPicker
									v-model="connection.web_search_model"
									:models="loadedModels(connection)"
									:label="t('webSearch.model')"
									:placeholder="connection.model"
								/><small>{{ t('webSearch.modelHelp') }}</small>
							</div>
						</template>
					</div>
					<template v-if="connection.web_search_protocol">
						<p>{{ t('webSearch.endpoint') }} <code>{{ searchEndpoint(connection) }}</code></p>
						<p>{{ t('webSearch.testHelp') }}</p>
						<XButton
							type="button"
							variant="secondary"
							:disabled="searchTest.isPending.value"
							@click="testSearch(connection)"
						>
							{{ searchTest.isPending.value ? t('webSearch.testing') : t('webSearch.test') }}
						</XButton>
						<template v-if="searchStamps[connection.id] === searchFingerprint(connection)">
							<p
								v-if="searchErrors[connection.id]"
								role="alert"
							>
								{{ searchErrors[connection.id] }}
							</p>
							<WebSearchEvidence
								v-if="searchResults[connection.id]"
								:result="searchResults[connection.id]"
							/>
						</template>
						<p v-else-if="searchStamps[connection.id]">
							{{ t('webSearch.changed') }}
						</p>
					</template>
				</details>
				<details
					v-if="connection.kind === 'chat'"
					class="model-options"
				>
					<summary><Icon icon="cog" /> {{ t('modelConfig.title') }}</summary>
					<p>{{ t('modelConfig.help') }}</p>
					<div class="fields">
						<label>{{ t('modelConfig.context') }}<input
							v-model.number="connection.context_window"
							:aria-label="t('modelConfig.context')"
							class="input"
							type="number"
							min="0"
							step="1"
							placeholder="0"
						><small>{{ t('modelConfig.contextHelp') }}</small></label>
						<label>{{ t('modelConfig.output') }}<input
							v-model.number="connection.max_output_tokens"
							:aria-label="t('modelConfig.output')"
							class="input"
							type="number"
							min="0"
							step="1"
							placeholder="0"
						><small>{{ t('modelConfig.outputHelp') }}</small></label>
						<label>{{ t('modelConfig.inputs') }}<select
							:value="connection.input_types?.join(',') || ''"
							:aria-label="t('modelConfig.inputs')"
							class="input"
							@change="changeInputTypes(connection, $event)"
						><option value="">{{ t('modelConfig.auto') }}</option><option value="text">{{ t('modelConfig.text') }}</option><option value="text,image">{{ t('modelConfig.vision') }}</option></select><small>{{ t('modelConfig.inputsHelp') }}</small></label>
						<label v-if="connection.protocol === 'openai-chat'">{{ t('modelConfig.outputField') }}<select
							v-model="connection.output_token_field"
							:aria-label="t('modelConfig.outputField')"
							class="input"
						><option value="">{{ t('modelConfig.auto') }}</option><option value="max_completion_tokens">max_completion_tokens</option><option value="max_tokens">max_tokens</option></select><small>{{ t('modelConfig.fieldHelp') }}</small></label>
					</div>
					<XButton
						v-if="listedModel(connection)"
						type="button"
						variant="secondary"
						@click="applyCapabilities(connection)"
					>
						{{ t('modelConfig.useListed') }}
					</XButton>
					<p
						v-if="savedMatches(connection) && connection.resolved"
						class="model-resolved"
					>
						{{ t('modelConfig.effective') }}:
						{{ t('modelConfig.context') }} {{ connection.resolved.context_window?.toLocaleString() || t('modelConfig.unknown') }} ·
						{{ t('modelConfig.output') }} {{ connection.resolved.max_output_tokens?.toLocaleString() || t('modelConfig.providerDefault') }} ·
						{{ connection.resolved.input_types?.includes('image') ? t('modelConfig.vision') : t('modelConfig.text') }}
					</p>
					<p v-else>
						{{ t('modelConfig.saveToResolve') }}
					</p>
				</details>
				<div class="endpoint-info">
					<label
						v-if="connection.protocol !== 'openai-transcription'"
						class="stream-choice"
					><input
						v-model="connection.non_streaming"
						type="checkbox"
					>{{ t('flow.nonStreaming') }}</label>
					<span>{{ t('tcymc.text.request_endpoint') }}</span><code>{{ endpoint(connection) }}</code><span>{{ t('tcymc.text.model_list_endpoint') }}</span><code>{{ endpoint(connection, true) }}</code><small v-if="connection.protocol === 'openai-audio'">{{ t('tcymc.text.audio_chat_needs_a_model_that_accepts_audio') }}</small><small v-if="connection.protocol === 'anthropic'">{{ t('tcymc.text.anthropic_messages_does_not_accept_raw_audio_use') }}</small>
				</div>
				<div class="actions">
					<XButton
						variant="secondary"
						icon="cloud-download-alt"
						:disabled="modelFetcher.isPending.value || !connection.base_url"
						@click="fetchModels(connection)"
					>
						{{ t('tcymc.text.fetch_model_list') }}
					</XButton>
					<XButton
						variant="secondary"
						type="button"
						icon="play"
						:disabled="test.isPending.value || !savedMatches(connection)"
						@click="testConnection(connection.id, connection.kind)"
					>
						{{ t('tcymc.text.test_saved_connection') }}
					</XButton>
					<XButton
						variant="tertiary"
						type="button"
						@click="removeConnection(connection.id)"
					>
						{{ t('tcymc.text.remove_connection') }}
					</XButton>
				</div>
				<p
					v-if="modelNotice[connection.id]"
					role="status"
				>
					{{ modelNotice[connection.id] }}
				</p><small>{{ t('tcymc.text.save_connection_changes_before_testing_you_can_fetch') }}</small>

				<div class="card-save">
					<XButton
						type="submit"
						icon="save"
						:disabled="save.isPending.value"
					>
						{{ savingPart === connection.id ? t('tcymc.text.saving') : t('modelSettings.saveConnection') }}
					</XButton>
					<span
						v-if="savedCards[connection.id] === cardStamp(connection)"
						role="status"
					>{{ t('modelSettings.saved') }}</span>
				</div>
				<p
					v-if="cardErrors[connection.id]"
					role="alert"
					class="notification is-danger"
				>
					{{ t('settingsDraft.retained') }} {{ cardErrors[connection.id] }}
				</p>
			</form>
			<XButton
				variant="secondary"
				type="button"
				icon="plus"
				data-tour="ai-add"
				:disabled="draft.connections.length >= 20"
				@click="addConnection"
			>
				{{ t('tcymc.text.add_model_connection') }}
			</XButton>
			<label
				v-if="activeTab === 'transcription' && speechModels.length"
				class="audio-test"
			>{{ t('tcymc.text.audio_file_for_connection_testing') }}<input
				type="file"
				accept="audio/*"
				@change="testAudio = ($event.target as HTMLInputElement).files?.[0]"
			></label>
			<p
				v-if="testResult"
				role="status"
				class="test-result"
			>
				{{ testResult }}<code
					v-if="endpointResult"
					class="endpoint-result"
				>{{ endpointResult }}</code>
			</p>
		</section>
		<form
			v-show="activeTab === 'roles'"
			class="tcy-panel"
			@submit.prevent="saveRoles"
		>
			<h3 data-tour="ai-roles">
				<Icon icon="sitemap" /> {{ t('tcymc.text.models_for_each_feature') }}
			</h3>
			<div class="fields">
				<label>{{ t('chatFiles.persona') }}<select
					v-model="draft.persona"
					class="input"
				><option value="arona">{{ t('chatFiles.personaArona') }}</option><option value="none">{{ t('chatFiles.personaNone') }}</option></select><small>{{ t('chatFiles.personaHint') }}</small></label>
				<label>{{ t('tcymc.text.task_ai_assistant') }}<select
					v-model="draft.assistant"
					class="input"
				><option value="">{{ t('tcymc.text.not_enabled') }}</option><option
					v-for="c in chatModels"
					:key="c.id"
					:value="c.id"
					:disabled="!persisted(c.id)"
				>{{ c.name }} · {{ c.model }}</option></select><small>{{ t('tcymc.text.choose_a_model_with_tool_calling_to_read') }}</small></label>
				<label>{{ t('tcymc.text.speech_recognition') }}<select
					v-model="draft.transcription"
					class="input"
				><option value="">{{ t('tcymc.text.not_enabled') }}</option><option
					v-for="c in speechModels"
					:key="c.id"
					:value="c.id"
					:disabled="!persisted(c.id)"
				>{{ c.name }} · {{ c.model }}</option></select><small>{{ t('tcymc.text.turn_recordings_or_uploaded_audio_into_text') }}</small></label>
				<label>{{ t('tcymc.text.transcript_cleanup') }}<select
					v-model="draft.cleanup"
					class="input"
				><option value="">{{ t('tcymc.text.keep_the_original_transcript') }}</option><option
					v-for="c in chatModels"
					:key="c.id"
					:value="c.id"
					:disabled="!persisted(c.id)"
				>{{ c.name }} · {{ c.model }}</option></select><small>{{ t('tcymc.text.improve_wording_and_punctuation_without_changing_tasks') }}</small></label>
			</div>
			<p>{{ t('modelSettings.saveConnectionFirst') }}</p>
			<XButton
				type="submit"
				icon="save"
				data-tour="ai-save"
				:disabled="save.isPending.value"
			>
				{{ savingPart === 'roles' ? t('tcymc.text.saving') : t('modelSettings.saveRoles') }}
			</XButton>
		</form>
		<p
			v-if="saveError"
			class="notification is-danger"
			role="alert"
		>
			{{ t('settingsDraft.retained') }} {{ saveError }}
		</p>
		<div class="actions">
			<XButton
				variant="secondary"
				:to="{name: 'tcy-ai'}"
			>
				{{ t('tcymc.text.open_ai_assistant') }}
			</XButton>
		</div>
	</div>
</template>

<style scoped>
.model-tabs {
 display: flex;
 gap: .35rem;
 padding: .25rem;
 border-radius: .85rem;
 background: var(--grey-100);
}
.model-tabs button {
 flex: 1;
 border: 0;
 border-radius: .65rem;
 padding: .7rem .45rem;
 min-block-size: 44px;
 background: transparent;
 color: var(--text-light);
 cursor: pointer;
 font: inherit;
 font-size: .85rem;
}
.model-tabs button.is-selected {
 background: var(--site-background);
 color: var(--text);
 box-shadow: 0 1px 4px #00000011;
}
.model-tabs span {
 margin-inline-start: .4rem;
 font-size: .7rem;
}
.card-save {
 display: flex;
 align-items: center;
 gap: .75rem;
 margin-block-start: 1rem;
}
.card-save span {
 color: var(--text-light);
 font-size: .8rem;
}

.model-options {
 padding: .85rem 1rem;
 border: 1px solid var(--grey-200);
 border-radius: .75rem;
 background: var(--site-background);
}
.model-options .fields > label {
 align-content: start;
}
.endpoint-info .stream-choice {
 display: flex;
 align-items: center;
 gap: .5rem;
}
.endpoint-info .stream-choice input {
 flex: 0 0 auto;
 inline-size: auto;
}
.model-options > summary {
 cursor: pointer;
 font-weight: 600;
}
.model-options[open] > summary {
 margin-block-end: .75rem;
}
.model-options p {
 margin-block: .65rem;
 overflow-wrap: anywhere;
}
.model-resolved {
 color: var(--text-light);
 font-size: .85rem;
}
.tcy-settings {
	display: grid;
	gap: 1.5rem;
}
.eyebrow {
	color: var(--primary);
	font-size: .75rem;
	letter-spacing: .16em;
}
h2 {
	margin-block: .25rem .75rem;
	font-size: 1.75rem;
}
h3 {
	margin-block-end: .75rem;
	font-size: 1.15rem;
}
.tcy-panel {
	padding: 1.5rem;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	background: var(--white);
}
.connection {
	margin-block: 1.25rem;
	padding: 1rem;
	border: 1px solid var(--grey-200);
	border-radius: .5rem;
}
.connection h4 {
	padding-inline: .5rem;
	font-weight: 600;
}
.fields {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 1rem;
}
label {
	display: grid;
	gap: .4rem;
	font-size: .9rem;
}
small {
	color: var(--grey-600);
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: .75rem;
	margin-block-start: 1rem;
}
.empty, .audio-test {
	margin-block: 1rem;
}
.test-result {
	margin-block-start: 1rem;
	padding: 1rem;
	background: var(--grey-100);
	white-space: pre-wrap;
}
.endpoint-info {
	display: grid;
	gap: .4rem;
	margin-block-start: 1rem;
	font-size: .85rem;
}
.endpoint-info code, .endpoint-result {
	display: block;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
@media (width <= 600px) {
	.tcy-panel {
		padding: 1rem;
	}
	.connection {
		padding: .75rem;
		min-inline-size: 0;
	}
	.fields {
		grid-template-columns: minmax(0, 1fr);
	}
	.actions > * {
		flex: 1 1 auto;
	}
}
</style>
