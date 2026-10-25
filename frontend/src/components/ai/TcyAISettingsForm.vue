<script setup lang="ts">
import {computed, ref} from 'vue'
import type {AISettings} from '@/client/queries/tcyAi'
import {useSaveAISettings, useTestAIConnection} from '@/client/queries/tcyAi'
import {isRequestContextAbort} from '@/client/requestContext'

const props = defineProps<{initial: AISettings}>()
type Settings = AISettings
function initialDraft(): Settings { return {
	connections: props.initial.connections.map(c => ({...c, api_key: ''})),
	assistant: props.initial.assistant,
	transcription: props.initial.transcription,
	cleanup: props.initial.cleanup,
} }
const draft = ref<Settings>(initialDraft())
const save = useSaveAISettings()
const test = useTestAIConnection()
const testResult = ref('')
const chatModels = computed(() => draft.value.connections.filter(c => c.kind === 'chat'))
const speechModels = computed(() => draft.value.connections.filter(c => c.kind === 'transcription'))
const testAudio = ref<File>()

function addConnection() {
	draft.value.connections.push({id: crypto.randomUUID(), name: '', base_url: '', model: '', kind: 'chat', api_key: '', has_key: false})
}

function removeConnection(id: string) {
	draft.value.connections = draft.value.connections.filter(c => c.id !== id)
	for (const role of ['assistant', 'transcription', 'cleanup'] as const) {
		if (draft.value[role] === id) draft.value[role] = ''
	}
}

async function saveSettings() {
	try { await save.mutateAsync(draft.value) } catch { return }
}

async function testConnection(id: string, kind: string) {
	testResult.value = ''
	let audio = ''
	if (kind === 'transcription') {
		if (!testAudio.value) { testResult.value = '请先选择一段测试音频。'; return }
		if (testAudio.value.size > 16 * 1024 * 1024) { testResult.value = '测试音频不能超过 16 MiB。'; return }
		audio = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result).split(',')[1])
			reader.onerror = reject
			reader.readAsDataURL(testAudio.value!)
		})
	}
	try {
		const result = await test.mutateAsync({connection_id: id, audio, filename: testAudio.value?.name ?? 'audio.webm'})
		testResult.value = result.text ?? ''
	} catch (e) { if (isRequestContextAbort(e)) return; testResult.value = '测试失败，请检查地址、密钥、模型及接口类型。' }
}
</script>

<template>
	<form
		class="tcy-settings"
		@submit.prevent="saveSettings"
	>
		<header>
			<p class="eyebrow">
				VIKUNJA X
			</p>
			<h2>AI 与语音</h2>
			<p>接入自己的模型，为语音识别、文字整理和任务助手分别选择合适的能力。</p>
		</header>
		<section class="tcy-panel">
			<h3>模型连接</h3>
			<p>支持 OpenAI 兼容接口。填写基础地址（例如 https://api.example.com/v1），密钥只保存在服务器。</p>
			<p
				v-if="!draft.connections.length"
				class="empty"
			>
				还没有模型连接。添加后即可在下方分配用途。
			</p>
			<fieldset
				v-for="(connection, index) in draft.connections"
				:key="connection.id"
				class="connection"
			>
				<legend>连接 {{ index + 1 }} · {{ connection.name || '新模型' }}</legend>
				<div class="fields">
					<label>连接名称<input
						v-model="connection.name"
						class="input"
						required
						maxlength="100"
						placeholder="例如：任务助手"
					></label>
					<label>接口类型<select
						v-model="connection.kind"
						class="input"
					><option value="chat">文字对话 / 工具调用</option><option value="transcription">语音识别 / 音频转写</option></select></label>
					<label>API 基础地址<input
						v-model="connection.base_url"
						class="input"
						required
						type="url"
						placeholder="https://api.example.com/v1"
						autocomplete="off"
					></label>
					<label>模型 ID<input
						v-model="connection.model"
						class="input"
						required
						placeholder="服务商提供的模型名称"
					></label>
					<label>API Key<input
						v-model="connection.api_key"
						class="input"
						type="password"
						autocomplete="new-password"
						:placeholder="initial.connections.some(c => c.id === connection.id && c.has_key) ? '已保存；留空保持不变' : '输入密钥，无需认证的服务可留空'"
					></label>
				</div>
				<div class="actions">
					<XButton
						variant="secondary"
						type="button"
						:disabled="test.isPending.value || !initial.connections.some(c => c.id === connection.id)"
						@click="testConnection(connection.id, connection.kind)"
					>
						测试已保存连接
					</XButton>
					<XButton
						variant="tertiary"
						type="button"
						@click="removeConnection(connection.id)"
					>
						移除连接
					</XButton>
				</div>
			</fieldset>
			<XButton
				variant="secondary"
				type="button"
				:disabled="draft.connections.length >= 20"
				@click="addConnection"
			>
				＋ 添加模型连接
			</XButton>
			<label class="audio-test">语音连接测试文件<input
				type="file"
				accept="audio/*"
				@change="testAudio = ($event.target as HTMLInputElement).files?.[0]"
			></label>
			<p
				v-if="testResult"
				role="status"
				class="test-result"
			>
				{{ testResult }}
			</p>
		</section>
		<section class="tcy-panel">
			<h3>功能使用的模型</h3>
			<div class="fields">
				<label>任务 AI 助手<select
					v-model="draft.assistant"
					class="input"
				><option value="">未启用</option><option
					v-for="c in chatModels"
					:key="c.id"
					:value="c.id"
				>{{ c.name }} · {{ c.model }}</option></select><small>需要模型支持工具调用，用于读取、创建和修改任务。</small></label>
				<label>语音识别<select
					v-model="draft.transcription"
					class="input"
				><option value="">未启用</option><option
					v-for="c in speechModels"
					:key="c.id"
					:value="c.id"
				>{{ c.name }} · {{ c.model }}</option></select><small>把录音或上传的音频转成文字。</small></label>
				<label>语音文字整理<select
					v-model="draft.cleanup"
					class="input"
				><option value="">不整理，保留识别原文</option><option
					v-for="c in chatModels"
					:key="c.id"
					:value="c.id"
				>{{ c.name }} · {{ c.model }}</option></select><small>修正口语和断句，不直接修改任务。</small></label>
			</div>
		</section>
		<div class="actions">
			<XButton
				variant="primary"
				type="submit"
				:disabled="save.isPending.value"
			>
				{{ save.isPending.value ? '保存中…' : '保存配置' }}
			</XButton><XButton
				variant="secondary"
				:to="{name: 'tcy-ai'}"
			>
				打开 AI 助手
			</XButton>
		</div>
	</form>
</template>

<style scoped>
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
legend {
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
</style>
