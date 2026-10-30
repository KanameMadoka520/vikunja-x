<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {useI18n} from 'vue-i18n'
import type {ChatAttachment} from '@/client/generated'
import {chatAttachmentQuery, fetchChatAttachment} from '@/client/queries/chatAttachments'
import {saveChatBlob, chatBytes} from '../export/files'
const props = defineProps<{conversationId: string, file: ChatAttachment, removable?: boolean, disabled?: boolean}>()
defineEmits<{remove: [id: string]}>()
const {t} = useI18n({useScope: 'global'})
const isImage = computed(() => /^image\/(png|jpeg|gif|webp)$/.test(props.file.mime || ''))
const blob = useQuery(computed(() => chatAttachmentQuery(props.conversationId, props.file.id!, isImage.value && !props.file.missing)))
const missing = computed(() => { const error = blob.error.value as {status?: number, response?: {status?: number}} | null; return props.file.missing || error?.status === 404 || error?.response?.status === 404 })
const url = ref('')
const failed = ref(false)
const saving = ref(false)
const preview = ref<HTMLDialogElement>()
watch(() => blob.data.value, data => { if (url.value) URL.revokeObjectURL(url.value); url.value = data ? URL.createObjectURL(data) : '' }, {immediate: true})
onBeforeUnmount(() => { if (url.value) URL.revokeObjectURL(url.value) })
async function download() {
	saving.value = true; failed.value = false
	try { saveChatBlob(blob.data.value ?? await fetchChatAttachment(props.conversationId, props.file.id!), props.file.name || 'attachment') }
	catch { failed.value = true } finally { saving.value = false }
}
</script>

<template>
	<figure
		class="chat-file"
		:data-file-id="file.id"
	>
		<button
			v-if="url"
			type="button"
			class="image-button"
			:aria-label="t('chatFiles.preview', {name: file.name})"
			@click="preview?.showModal()"
		>
			<img
				:src="url"
				:alt="file.name"
				loading="lazy"
			>
		</button>
		<figcaption>
			<span
				class="file-name"
				:title="file.name"
			>{{ file.name }}</span><small>{{ chatBytes(file.size) }}</small>
			<span
				v-if="missing"
				class="file-error"
			>{{ t('chatFiles.missing') }}</span>
			<button
				v-else
				type="button"
				:disabled="saving"
				@click="download"
			>
				{{ saving ? t('chatFiles.loading') : t('chatFiles.download') }}
			</button>
			<button
				v-if="removable"
				type="button"
				:disabled="disabled"
				:aria-label="t('chatFiles.remove', {name: file.name})"
				@click="$emit('remove', file.id!)"
			>
				{{ t('tcymc.text.remove') }}
			</button>
			<span
				v-if="failed || (blob.isError.value && !missing)"
				role="alert"
			>{{ t('chatFiles.loadFailed') }}</span>
		</figcaption>
		<dialog
			ref="preview"
			class="image-preview"
			@click="($event.target === preview) && preview?.close()"
		>
			<button
				type="button"
				@click="preview?.close()"
			>
				{{ t('misc.close') }}
			</button><img
				v-if="url"
				:src="url"
				:alt="file.name"
			><p>{{ file.name }}</p>
		</dialog>
	</figure>
</template>

<style scoped lang="scss">
.chat-file { margin: 0;
padding: .5rem;
border: 1px solid var(--grey-200);
border-radius: .75rem;
inline-size: 180px;
max-inline-size: 100%;
background: var(--white);
}
.image-button { display: block;
inline-size: 100%;
padding: 0;
border: 0;
background: transparent;
cursor: zoom-in;
}
.image-button img { inline-size: 100%;
block-size: 110px;
object-fit: contain;
border-radius: .4rem;
}
figcaption { display: flex;
flex-wrap: wrap;
gap: .35rem .6rem;
font-size: .75rem;
}
.file-name { inline-size: 100%;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
}
figcaption button { border: 0;
background: none;
color: var(--link);
cursor: pointer;
padding: .2rem 0;
min-block-size: 32px;
}
.file-error { color: var(--danger);
}
.image-preview { border: 0;
border-radius: 1rem;
max-inline-size: 95vw;
max-block-size: 90dvh;
background: var(--white);
color: var(--text);
}
.image-preview::backdrop { background: #00000099;
}
.image-preview img { display: block;
max-inline-size: 85vw;
max-block-size: 70dvh;
object-fit: contain;
}
.image-preview button { display: block;
margin-inline-start: auto;
padding: .5rem;
}
</style>
