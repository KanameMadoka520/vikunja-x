<template>
	<BaseButton
		class="trigger-button screenshot-trigger"
		:title="t('screenshot.open')"
		:aria-label="t('screenshot.open')"
		:disabled="loading"
		@click="open"
	>
		<Icon icon="eye-slash" /><span>{{ t('screenshot.short') }}</span>
	</BaseButton>
	<Teleport to="body">
		<dialog
			ref="dialog"
			class="screenshot-dialog"
			:aria-label="t('screenshot.title')"
			@cancel.prevent="close"
			@keydown.stop
			@close="cleanup"
		>
			<div
				ref="preview"
				class="screenshot-snapshot"
			/>
			<div class="screenshot-toolbar">
				<span>{{ t('screenshot.note') }}</span>
				<button
					ref="closeButton"
					type="button"
					@click="close"
				>
					{{ t('screenshot.close') }}
				</button>
			</div>
		</dialog>
	</Teleport>
</template>

<script setup lang="ts">
import {ref, onBeforeUnmount, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import BaseButton from '@/components/base/BaseButton.vue'
import {error} from '@/message'

const {t} = useI18n()
const route = useRoute()
const dialog = ref<HTMLDialogElement | null>(null)
const preview = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const loading = ref(false)
let disposed = false
let previousOverflow: string | undefined

async function open() {
	if (loading.value || dialog.value?.open) return
	loading.value = true
	const targetRoute = route.fullPath
	try {
		const {createScreenshotPreview} = await import('@/helpers/screenshotPreview')
		if (disposed || route.fullPath !== targetRoute) return
		const source = document.getElementById('app')
		if (!source || !preview.value || !dialog.value) return
		const snapshot = createScreenshotPreview(source, {project: t('screenshot.project'), task: t('screenshot.task'), person: t('screenshot.person'), content: t('screenshot.content'), image: t('screenshot.image')})
		preview.value.replaceChildren(snapshot)
		previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		document.body.classList.add('screenshot-preview-active')
		dialog.value.showModal()
		closeButton.value?.focus({preventScroll: true})
	} catch (cause) {cleanup(); error(cause)} finally {loading.value = false}
}
function cleanup() {
	document.body.classList.remove('screenshot-preview-active')
	preview.value?.replaceChildren()
	if (previousOverflow !== undefined) {document.body.style.overflow = previousOverflow; previousOverflow = undefined}
}
function close() {dialog.value?.close(); cleanup()}
watch(() => route.fullPath, close)
onBeforeUnmount(() => {disposed = true; close()})
</script>

<style lang="scss">
.screenshot-trigger {
 display: inline-flex;
 align-items: center;
 justify-content: center;
 gap: .4rem;
 padding: .5rem .65rem;
 border-radius: .75rem;
 background: var(--white);
 color: var(--text);
 box-shadow: var(--shadow-sm);
 font-size: .8rem;
 font-weight: 600;
 white-space: nowrap;
}

body.screenshot-preview-active #app,
body.screenshot-preview-active #app * {
 visibility: hidden !important;
}

.screenshot-dialog {
 animation: none !important;
 transition: none !important;
 opacity: 1 !important;
 transform: none !important;
 position: fixed;
 inset: 0;
 inline-size: 100vw;
 block-size: 100dvh;
 max-inline-size: none;
 max-block-size: none;
 margin: 0;
 padding: 0;
 border: 0;
 color: var(--text);
 background: var(--site-background);
 overflow: hidden;
}
.screenshot-snapshot {
 block-size: 100%;
 overflow: auto;
 pointer-events: none;
 user-select: none;
 & *, & *::before, & *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
 }
}
.screenshot-toolbar {
 position: fixed;
 inset-inline: 1rem;
 inset-block-end: max(1rem, env(safe-area-inset-bottom));
 z-index: 2147483647;
 display: flex;
 align-items: center;
 justify-content: center;
 gap: 1rem;
 inline-size: fit-content;
 max-inline-size: calc(100% - 2rem);
 margin-inline: auto;
 padding: .65rem 1rem;
 border: 1px solid var(--grey-300);
 border-radius: 1rem;
 background: var(--white);
 color: var(--text);
 box-shadow: 0 4px 24px #00000022;
 font-size: .8rem;
 button {
  flex-shrink: 0;
  border: 0;
  border-radius: .5rem;
  padding: .6rem .8rem;
  color: white;
  background: var(--primary);
  cursor: pointer;
  font-weight: 600;
 }
}
</style>
