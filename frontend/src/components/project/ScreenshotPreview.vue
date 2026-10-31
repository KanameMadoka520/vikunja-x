<template>
	<XButton
		class="screenshot-trigger"
		variant="secondary"
		icon="eye-slash"
		:title="t('screenshot.open')"
		:aria-label="t('screenshot.open')"
		:disabled="loading"
		@click="open"
	>
		{{ t('screenshot.short') }}
	</XButton>
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
import XButton from '@/components/input/Button.vue'
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
	color: var(--text-primary);
	background: var(--surface-app);
	overflow: hidden;
}

// Contains the cloned app's z-indexes (fixed header, floating dock) below the toolbar.
.screenshot-snapshot {
	isolation: isolate;
	block-size: 100%;
	overflow: auto;
	pointer-events: none;
	user-select: none;

	& *,
	& *::before,
	& *::after {
		animation: none !important;
		transition: none !important;
		caret-color: transparent !important;
	}
}

.screenshot-toolbar {
	position: fixed;
	inset-inline: var(--space-4);
	inset-block-end: max(var(--space-4), env(safe-area-inset-bottom));
	z-index: var(--layer-floating);
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: var(--space-2) var(--space-4);
	inline-size: fit-content;
	max-inline-size: calc(100% - 2 * var(--space-4));
	margin-inline: auto;
	padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
	border: 1px solid var(--border-default);
	border-radius: var(--radius-lg);
	background: var(--surface-raised);
	color: var(--text-primary);
	box-shadow: var(--elevation-3);
	font-size: var(--text-sm);

	button {
		flex-shrink: 0;
		min-block-size: var(--control-height);
		padding-inline: var(--space-3);
		border: 0;
		border-radius: $radius;
		color: var(--text-on-accent);
		background: var(--switch-view-active-background);
		cursor: pointer;
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);

		&:focus-visible {
			@include focus-ring;
		}
	}
}
</style>
