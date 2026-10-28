<script setup lang="ts">
import {ref, onMounted, onBeforeUnmount} from 'vue'
import {useI18n} from 'vue-i18n'
import type {Conversation} from '@/client/generated'
import {fetchConversationExport} from '@/client/queries/chatAttachments'
import {conversationPDF} from './pdf'
import {saveChatBlob} from './files'
const props = defineProps<{conversation: Conversation}>()
const emit = defineEmits<{close: []}>()
const {t} = useI18n({useScope: 'global'})
const dialog = ref<HTMLDialogElement>()
const format = ref<'pdf' | 'zip' | 'md' | 'json'>('pdf')
const working = ref(false)
const status = ref('')
const failure = ref('')
let controller: AbortController | undefined
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => controller?.abort())
async function start() {
	if (working.value) return
	working.value = true; failure.value = ''; status.value = t('chatFiles.exportPreparing')
	controller = new AbortController()
	const c = JSON.parse(JSON.stringify(props.conversation)) as Conversation
	try {
		const blob = format.value === 'pdf' ? await conversationPDF(c, {you: t('tcymc.text.you'), assistant: t('tcymc.text.task_assistant'), missing: t('chatFiles.missing'), unreadable: t('chatFiles.pdfFile'), drafts: t('chatFiles.drafts'), summary: t('chatFiles.summary'), generated: t('chatFiles.generated'), status: t('chatFiles.status'), model: t('chatFiles.model'), duration: t('chatFiles.duration'), steps: t('chatFiles.tools')}, (done, total, stage) => { status.value = stage === 'pdf' ? t('chatFiles.pdfPreparing') : t('chatFiles.exportProgress', {done, total}) }, controller.signal) : await fetchConversationExport(c.id!, format.value, controller.signal)
		controller.signal.throwIfAborted()
		saveChatBlob(blob, `${(c.title || 'Arona').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.${format.value}`)
		status.value = t('chatFiles.exportDone')
	} catch (error) { if (!controller.signal.aborted) failure.value = t('chatFiles.exportFailed') + ' ' + (error instanceof Error ? error.message : '') }
	finally { working.value = false }
}
</script>

<template>
	<dialog
		ref="dialog"
		class="export-dialog"
		aria-labelledby="chat-export-title"
		@close="emit('close')"
	>
		<h2 id="chat-export-title">
			{{ t('chatFiles.export') }}
		</h2>
		<p>{{ t('chatFiles.exportHint') }}</p>
		<label>{{ t('chatFiles.format') }}<select
			v-model="format"
			:disabled="working"
		><option value="pdf">{{ t('chatFiles.pdf') }}</option><option value="zip">{{ t('chatFiles.zip') }}</option><option value="md">{{ t('chatFiles.md') }}</option><option value="json">JSON</option></select></label>
		<p class="export-note">
			{{ t(`chatFiles.hint_${format}`) }}
		</p>
		<p
			v-if="conversation.turns?.some(turn => turn.status === 'running')"
			class="export-note"
		>
			{{ t('chatFiles.runningSnapshot') }}
		</p>
		<progress
			v-if="working"
			:aria-label="status"
		/>
		<p role="status">
			{{ status }}
		</p><p
			v-if="failure"
			role="alert"
		>
			{{ failure }}
		</p>
		<div class="export-actions">
			<button
				type="button"
				@click="controller?.abort(); dialog?.close()"
			>
				{{ t('misc.close') }}
			</button><button
				type="button"
				:disabled="working"
				@click="start"
			>
				{{ t('chatFiles.download') }}
			</button>
		</div>
	</dialog>
</template>

<style scoped lang="scss">
.export-dialog { inline-size: min(520px, calc(100vw - 2rem));
max-block-size: 85dvh;
overflow: auto;
padding: 1.5rem;
border: 1px solid var(--grey-200);
border-radius: 1rem;
color: var(--text);
background: var(--white);
}
.export-dialog::backdrop { background: #00000066;
}
h2 { font-size: 1.2rem;
}
p { font-size: .9rem;
line-height: 1.6;
}
label, select { display: block;
inline-size: 100%;
}
select { margin-block: .5rem;
padding: .6rem;
background: var(--white);
color: var(--text);
border: 1px solid var(--grey-300);
border-radius: .5rem;
}
.export-note { color: var(--text-light);
}
.export-actions { display: flex;
justify-content: flex-end;
gap: .75rem;
}
button { min-block-size: 44px;
padding: .6rem 1rem;
border: 1px solid var(--grey-300);
border-radius: .5rem;
cursor: pointer;
}
progress { inline-size: 100%;
}
</style>
