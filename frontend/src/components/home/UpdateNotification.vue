<template>
	<div
		v-if="updateAvailable"
		ref="banner"
		class="update-notification"
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
.update-notification {
	position: fixed;
	// FIXME: We should prevent usage of z-index or
	// at least define it centrally
	// the highest z-index of a modal is .hint-modal with 4500
	z-index: 5000;
	inset-block-end: 1rem;
	inset-inline: 1rem;
	max-inline-size: max-content;
	margin-inline: auto;

	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: .5rem .5rem .5rem 1rem;
	background: $warning;
	border-radius: $radius;
	font-size: .9rem;
	color: hsl(220.9, 39.3%, 11%);
	// color copied to avoid it changing in dark mode
}

.update-notification__message {
	inline-size: 100%;
	text-align: center;
}
.update-notification__message small {
	display: block;
	margin-block-start: .25rem;
}
@media (width <= 600px) {
	.update-notification {
		flex-direction: column;
		max-inline-size: calc(100% - 2rem);
		padding: .75rem;
	}
}
</style>
