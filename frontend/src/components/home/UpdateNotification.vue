<template>
	<div
		v-if="updateAvailable"
		ref="banner"
		class="update-notification d-print-none"
		role="status"
	>
		<p class="update-notification__message">
			{{ t('tcymc.updateAvailable', {version: targetVersion}) }}
			<small>{{ t('tcymc.currentVersion', {version: VERSION}) }}</small>
		</p>
		<XButton
			:shadow="false"
			:wrap="false"
			@click="refreshApp()"
		>
			{{ t('tcymc.updateRefresh') }}
		</XButton>
	</div>
</template>

<script lang="ts" setup>
import {computed, onMounted, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useElementSize} from '@vueuse/core'
import {useBaseStore} from '@/stores/base'
import {useAuthStore} from '@/stores/auth'
import {needsFrontendRefresh, readWorkerVersion} from '@/helpers/frontendUpdate'
import {VERSION} from '@/version.json'

const {t} = useI18n({useScope: 'global'})
const baseStore = useBaseStore()
const authStore = useAuthStore()
const updateAvailable = computed(() => baseStore.updateAvailable && authStore.authenticated)
const banner = ref<HTMLElement>()
const {height: bannerHeight} = useElementSize(banner)
watch(bannerHeight, height => document.documentElement.style.setProperty('--app-update-banner-height', `${height}px`))
const registration = ref<ServiceWorkerRegistration | null>(null)
const refreshing = ref(false)
const targetVersion = ref('')
let disposed = false
let updateCheck = 0

function clearUpdate() {
	registration.value = null
	targetVersion.value = ''
	baseStore.setUpdateAvailable(false)
}
async function showRefreshUI(e?: Event) {
	const check = ++updateCheck
	if (!('serviceWorker' in navigator)) return
	try {
		const reg = (e as CustomEvent<ServiceWorkerRegistration> | undefined)?.detail ?? await navigator.serviceWorker.getRegistration()
		if (disposed || check !== updateCheck) return
		clearUpdate()
		const waiting = reg?.waiting
		if (!reg || !waiting) return
		const version = await readWorkerVersion(waiting)
		if (disposed || check !== updateCheck || reg.waiting !== waiting) return
		if (!needsFrontendRefresh(VERSION, version)) return
		registration.value = reg
		targetVersion.value = version
		baseStore.setUpdateAvailable(true)
	} catch {
		if (!disposed && check === updateCheck) clearUpdate()
	}
}
function controllerChanged() {
	if (!refreshing.value) {
		void showRefreshUI()
		return
	}
	refreshing.value = false
	window.location.reload()
}
function refreshApp() {
	baseStore.setUpdateAvailable(false)
	if (!registration.value?.waiting) { window.location.reload(); return }
	refreshing.value = true
	registration.value.waiting.postMessage('skipWaiting')
}
onMounted(() => {
	document.addEventListener('swUpdated', showRefreshUI)
	navigator.serviceWorker?.addEventListener('controllerchange', controllerChanged)
	void showRefreshUI().catch(() => {})
})
onBeforeUnmount(() => {
	disposed = true
	document.documentElement.style.removeProperty('--app-update-banner-height')
	document.removeEventListener('swUpdated', showRefreshUI)
	navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged)
})
</script>

<style lang="scss" scoped>
// Bottom-start, clear of the bottom-end dock (upload panel and Arona launcher).
.update-notification {
	position: fixed;
	inset-block-end: var(--dock-inset-block);
	inset-inline-start: var(--dock-inset-inline);
	z-index: var(--layer-floating);
	display: flex;
	align-items: center;
	gap: var(--space-3);
	max-inline-size: min(34rem, calc(100vw - var(--dock-inset-inline) - var(--dock-reserve-inline)));
	padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
	border: 1px solid var(--border-default);
	border-inline-start: 3px solid var(--primary);
	border-radius: var(--radius-md);
	background: var(--surface-raised);
	box-shadow: var(--elevation-3);
	color: var(--text-primary);
	font-size: var(--text-sm);
}

.update-notification__message {
	min-inline-size: 0;
	line-height: var(--leading-normal);
	overflow-wrap: anywhere;
}

.update-notification__message small {
	display: block;
	margin-block-start: var(--space-1);
	color: var(--text-secondary);
	font-size: var(--text-xs);
}

@media (width <= 600px) {
	.update-notification {
		flex-direction: column;
		align-items: stretch;
		padding: var(--space-3);
	}
}
</style>
