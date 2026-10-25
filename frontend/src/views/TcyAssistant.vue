<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from 'vue'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {aiSettingsQuery, useCleanupAI, useRunAI, useTranscribeAI} from '@/client/queries/tcyAi'
import type {AIRunResult} from '@/client/queries/tcyAi'
import {useProjects} from '@/composables/useProjects'
import {useTitle} from '@/composables/useTitle'
import {isRequestContextAbort} from '@/client/requestContext'

useTitle('AI 任务助手')
const route = useRoute()
const projectID = ref(Number(route.query.project) || 0)
const {projectsArray} = useProjects()
const settings = useQuery(aiSettingsQuery())
const run = useRunAI()
const transcribe = useTranscribeAI()
const cleanup = useCleanupAI()
const prompt = ref('')
const mode = ref<'read' | 'write'>('write')
const allowDelete = ref(false)
const tidy = ref(true)
const original = ref('')
const notice = ref('')
const conversation = ref<{prompt: string, result: AIRunResult}[]>([])
const recording = ref(false)
const elapsed = ref(0)
const busy = computed(() => run.isPending.value || transcribe.isPending.value || cleanup.isPending.value)
const hasAssistant = computed(() => Boolean(settings.data.value?.assistant))
const hasSpeech = computed(() => Boolean(settings.data.value?.transcription))
let recorder: MediaRecorder | undefined
let stream: MediaStream | undefined
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false

const labels: Record<string, string> = {list_projects: '查询项目', list_tasks: '查询任务', get_task: '读取任务', create_project: '创建项目', create_task: '创建任务', update_task: '更新任务', delete_task: '删除任务'}

async function submit() {
	if (!prompt.value.trim() || busy.value || recording.value) return
	const message = prompt.value.trim()
	const history = conversation.value.slice(-5).flatMap(t => [{role: 'user' as const, content: t.prompt}, {role: 'assistant' as const, content: t.result.reply}])
	try {
		const result = await run.mutateAsync({message, history, project_id: projectID.value, mode: mode.value, allow_delete: allowDelete.value && mode.value === 'write', request_id: crypto.randomUUID()})
		conversation.value.push({prompt: message, result})
		prompt.value = ''
	} catch (e) { if (isRequestContextAbort(e)) return; notice.value = '请求未完成。若已开始修改，请先检查任务状态，再决定是否重新执行。' }
}

async function processAudio(file: Blob, filename: string) {
	if (file.size > 16 * 1024 * 1024) { notice.value = '音频不能超过 16 MiB。'; return }
	if (!file.size) { notice.value = '录音为空，请重试。'; return }
	notice.value = ''
	try {
		const audio = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result).split(',')[1])
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
		const result = await transcribe.mutateAsync({audio, filename, cleanup: tidy.value})
		if (disposed) return
		original.value = result.original ?? ''
		prompt.value = [prompt.value, result.text].filter(Boolean).join('\n')
		notice.value = result.warning || '识别完成。可以编辑文字，然后发送给助手。'
	} catch (e) { if (isRequestContextAbort(e)) return; notice.value = '识别失败，请检查语音模型配置或更换音频格式。' }
}

function stopTracks() {
	stream?.getTracks().forEach(track => track.stop())
	if (timer) clearInterval(timer)
}

async function toggleRecording() {
	if (recording.value) { recorder?.stop(); return }
	if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
		notice.value = '当前浏览器不支持录音，请上传音频文件。'; return
	}
	try {
		stream = await navigator.mediaDevices.getUserMedia({audio: true})
		if (disposed) { stopTracks(); return }
		const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
		recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined)
		const chunks: Blob[] = []
		recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
		recorder.onstop = () => {
			recording.value = false
			stopTracks()
			if (!disposed) void processAudio(new Blob(chunks, {type: recorder?.mimeType}), mimeType?.includes('mp4') ? 'recording.m4a' : 'recording.webm')
		}
		recorder.onerror = () => { recording.value = false; stopTracks(); notice.value = '录音中断，请重试。' }
		recorder.start(1000)
		recording.value = true
		elapsed.value = 0
		timer = setInterval(() => { elapsed.value++; if (elapsed.value >= 180 && recorder?.state === 'recording') recorder.stop() }, 1000)
	} catch { stopTracks(); notice.value = '无法使用麦克风，请检查浏览器录音权限。' }
}

async function upload(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (file) await processAudio(file, file.name)
	input.value = ''
}

async function tidyText() {
	try {
		const result = await cleanup.mutateAsync(prompt.value)
		original.value = result.original ?? ''
		prompt.value = result.text ?? ''
	} catch { return }
}

onBeforeUnmount(() => {
	disposed = true
	if (recorder?.state === 'recording') recorder.stop()
	stopTracks()
})
</script>

<template>
	<main class="tcy-assistant">
		<header class="assistant-heading">
			<div>
				<p class="eyebrow">
					VIKUNJA X · YOUR WORK, YOUR MODELS
				</p><h1>AI 任务助手</h1><p>说出计划，让任务开始行动。</p>
			</div>
			<RouterLink
				class="button"
				:to="{name: 'user.settings.ai'}"
			>
				AI 与语音设置
			</RouterLink>
		</header>
		<div
			v-if="!hasAssistant && !settings.isPending.value"
			class="setup-note"
		>
			先在「AI 与语音设置」中添加模型，并为任务助手选择支持工具调用的模型。
		</div>
		<section
			class="assistant-options"
			aria-label="助手操作范围"
		>
			<label>当前项目<select
				v-model.number="projectID"
				class="input"
			><option :value="0">全部可访问项目</option><option
				v-for="project in projectsArray.filter(p => p.id > 0 && !p.is_archived)"
				:key="project.id"
				:value="project.id"
			>{{ project.title }}</option></select></label>
			<label>工作方式<select
				v-model="mode"
				class="input"
			><option value="write">直接执行：允许创建和修改</option><option value="read">只读：查询与建议</option></select></label>
			<label class="checkbox"><input
				v-model="allowDelete"
				type="checkbox"
				:disabled="mode === 'read'"
			> 本次允许删除任务</label>
		</section>
		<section
			class="conversation"
			aria-label="助手对话"
			aria-live="polite"
		>
			<div
				v-if="!conversation.length"
				class="welcome"
			>
				<h2>从一句话开始</h2>
				<p>查询进度、拆分计划，或把口头想法变成具体任务。</p>
				<div class="suggestions">
					<button
						class="button"
						@click="prompt = '列出我还未完成的任务，按优先级给我一个今天的安排建议。'"
					>
						今天先做什么
					</button><button
						class="button"
						@click="prompt = '在当前项目中新建一个任务：整理本周工作总结，截止时间是本周五下午六点。'"
					>
						一句话创建任务
					</button>
				</div>
			</div>
			<article
				v-for="(turn, index) in conversation"
				:key="index"
				class="turn"
			>
				<div class="user-message">
					<strong>你</strong><p>{{ turn.prompt }}</p>
				</div>
				<div class="assistant-message">
					<strong>任务助手</strong><p>{{ turn.result.reply }}</p>
					<details
						v-for="(action, actionIndex) in turn.result.actions"
						:key="actionIndex"
						class="operation"
					>
						<summary>{{ action.success ? '✓' : '×' }} {{ labels[action.tool] || action.tool }} · {{ action.success ? '成功' : '失败' }}</summary><pre>{{ action.arguments }}</pre><pre>{{ action.result }}</pre>
					</details>
				</div>
			</article>
			<p
				v-if="run.isPending.value"
				class="working"
				role="status"
			>
				正在读取任务并处理指令…
			</p>
		</section>
		<form
			class="composer"
			@submit.prevent="submit"
		>
			<label
				for="ai-prompt"
				class="composer-label"
			>你的指令</label>
			<textarea
				id="ai-prompt"
				v-model="prompt"
				class="textarea"
				rows="4"
				maxlength="12000"
				placeholder="例如：把当前项目里还没完成的文档任务，截止日期改到下周五。"
				:disabled="run.isPending.value"
			/>
			<div class="composer-tools">
				<button
					class="button"
					type="button"
					:disabled="busy || !hasSpeech"
					@click="toggleRecording"
				>
					{{ recording ? `停止录音 · ${elapsed}s` : '语音输入' }}
				</button>
				<label
					class="button"
					:class="{'is-disabled': busy || !hasSpeech || recording}"
				>上传音频<input
					class="audio-upload"
					type="file"
					accept="audio/*"
					:disabled="busy || !hasSpeech || recording"
					@change="upload"
				></label>
				<label class="checkbox"><input
					v-model="tidy"
					type="checkbox"
				> 识别后整理文字</label>
				<button
					class="button"
					type="button"
					:disabled="busy || !prompt.trim() || !settings.data.value?.cleanup"
					@click="tidyText"
				>
					仅整理文字
				</button>
				<button
					class="button is-primary send"
					type="submit"
					:disabled="busy || recording || !hasAssistant || !prompt.trim()"
				>
					{{ busy ? '处理中…' : '发送指令' }}
				</button>
			</div>
			<p
				v-if="notice"
				role="status"
				class="notice"
			>
				{{ notice }}
			</p>
			<details v-if="original">
				<summary>查看识别 / 整理前原文</summary><p class="original">
					{{ original }}
				</p>
			</details>
			<p class="hint">
				录音最长 3 分钟，上传最大 16 MiB。语音先转成可编辑文字，发送后才会操作任务。
			</p>
		</form>
	</main>
</template>

<style scoped>
.tcy-assistant {
	max-inline-size: 1050px;
	margin-inline: auto;
	padding: 1rem;
	}
.assistant-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 1rem;
	margin-block-end: 1.5rem;
	}
.eyebrow {
	color: var(--primary);
	font-size: .7rem;
	letter-spacing: .13em;
	}
h1 {
	margin-block: .5rem;
	font-size: 2rem;
	}
.setup-note {
	margin-block-end: 1rem;
	padding: 1rem;
	border-inline-start: 3px solid var(--primary);
	background: var(--grey-100);
	}
.assistant-options {
	display: flex;
	align-items: end;
	flex-wrap: wrap;
	gap: 1rem;
	padding: 1rem;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	}
.assistant-options > label {
	display: grid;
	gap: .4rem;
	font-size: .85rem;
	}
.conversation {
	min-block-size: 260px;
	padding-block: 1.5rem;
	}
.welcome {
	padding: 2.5rem 1rem;
	text-align: center;
	color: var(--grey-600);
	}
.welcome h2 {
	margin-block-end: .75rem;
	font-size: 1.5rem;
	color: var(--grey-800);
	}
.suggestions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: .75rem;
	margin-block-start: 1.5rem;
	}
.turn {
	margin-block-end: 1.5rem;
	}
.user-message, .assistant-message {
	padding: 1rem 1.25rem;
	border-radius: .75rem;
	}
.user-message {
	margin-inline-start: 8%;
	background: var(--grey-100);
	}
.assistant-message {
	margin-block-start: .5rem;
	border: 1px solid var(--grey-200);
	}
.turn p, .original {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	margin-block-start: .5rem;
	}
.operation {
	margin-block-start: .75rem;
	font-size: .85rem;
	}
.operation pre {
	max-block-size: 240px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	margin-block-start: .5rem;
	}
.composer {
	padding: 1rem;
	border: 1px solid var(--grey-300);
	border-radius: .75rem;
	background: var(--white);
	}
.composer-label {
	display: block;
	margin-block-end: .5rem;
	font-weight: 600;
	}
.composer-tools {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: .75rem;
	margin-block-start: 1rem;
	}
.send {
	margin-inline-start: auto;
	}
.audio-upload {
	display: none;
	}
.checkbox, .hint {
	font-size: .8rem;
	}
.hint, .notice {
	margin-block-start: .75rem;
	color: var(--grey-600);
	}
.working {
	padding: 1rem;
	color: var(--primary);
	}
.is-disabled {
	opacity: .5;
	}
</style>
