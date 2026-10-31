<template>
	<div class="share-auth">
		<h1 class="share-auth-title">
			{{ $t('sharing.sharedProject') }}
		</h1>
		<Message
			v-if="loading && !authenticateWithPassword"
			role="status"
		>
			{{ $t('sharing.authenticating') }}
		</Message>
		<form
			v-if="authenticateWithPassword"
			class="share-auth-form"
			@submit.prevent="authenticate()"
		>
			<p class="share-auth-text">
				{{ $t('sharing.passwordRequired') }}
			</p>
			<FormField
				id="linkSharePassword"
				v-model="password"
				v-focus
				type="password"
				autocomplete="off"
				:label="$t('user.auth.password')"
				:placeholder="$t('user.auth.passwordPlaceholder')"
			/>
			<XButton
				type="submit"
				class="share-auth-submit"
				:loading="loading"
			>
				{{ $t('user.auth.login') }}
			</XButton>
		</form>
		<Message
			v-if="errorMessage !== ''"
			variant="danger"
		>
			{{ errorMessage }}
		</Message>
	</div>
</template>

<script lang="ts" setup>
import type {VikunjaErrorModel} from '@/client/generated'
import {ref, computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useTitle} from '@vueuse/core'

import Message from '@/components/misc/Message.vue'
import FormField from '@/components/input/FormField.vue'
import {LINK_SHARE_HASH_PREFIX} from '@/constants/linkShareHash'

import {useBaseStore} from '@/stores/base'
import {useAuthStore} from '@/stores/auth'
import {useRedirectToLastVisited} from '@/composables/useRedirectToLastVisited'

const {t} = useI18n({useScope: 'global'})
const {getLastVisitedRoute} = useRedirectToLastVisited()

function useAuth() {
	const baseStore = useBaseStore()
	const authStore = useAuthStore()
	const route = useRoute()
	const router = useRouter()

	const loading = ref(false)
	const authenticateWithPassword = ref(false)
	const errorMessage = ref('')
	const password = ref('')

	const authLinkShare = computed(() => authStore.authLinkShare)

	function redirectToProject(projectId: number) {
		const hash = LINK_SHARE_HASH_PREFIX + route.params.share

		const viewId =
			new URLSearchParams(window.location.search).get('view') || null

		const last = getLastVisitedRoute()
		if (last) {
			return router.push({
				...last,
				hash,
			})
		}

		if (viewId) {
			return router.push({
				name: 'project.view',
				params: {
					projectId,
					viewId,
				},
				hash,
			})
		}

		return router.push({
			name: 'project.index',
			params: {
				projectId,
			},
			hash,
		})
	}

	async function authenticate() {
		errorMessage.value = ''

		if (authLinkShare.value) {
			// FIXME: push to 'project.list' since authenticated?
			return
		}

		// TODO: no password

		loading.value = true

		try {
			const {project_id: projectId} = await authStore.linkShareAuth({
				hash: String(route.params.share),
				password: password.value,
			})
			const logoVisible = route.query.logoVisible
				? route.query.logoVisible === 'true'
				: true
			baseStore.setLogoVisible(logoVisible)

			return redirectToProject(projectId)
		} catch (cause) {
			const e = cause as VikunjaErrorModel
			if (e?.code === 13001) {
				authenticateWithPassword.value = true
				return
			}

			// Handle generic 403 errors that might occur after initial auth
			if (e?.status === 403 && !e?.code) {
				errorMessage.value = t('sharing.accessDenied')
				authenticateWithPassword.value = false
				return
			}
			
			// Handle network/server errors
			if ((e?.status ?? 0) >= 500 || !e?.status) {
				errorMessage.value = t('sharing.serverError')
				authenticateWithPassword.value = false
				return
			}
			
			// Log only status and code; authentication failures can include secrets.
			console.error('Link share authentication error:', e?.status, e?.code)

			// TODO: Put this logic in a global errorMessage handler method which checks all auth codes
			let err = t('sharing.error')
			if (e?.detail) {
				err = e.detail
			}
			if (e?.code === 13002) {
				err = t('sharing.invalidPassword')
				authenticateWithPassword.value = true
			}
			errorMessage.value = err
		} finally {
			loading.value = false
		}
	}

	authenticate()

	return {
		loading,
		authenticateWithPassword,
		errorMessage,
		password,
		authenticate,
	}
}

const {
	loading,
	authenticateWithPassword,
	errorMessage,
	password,
	authenticate,
} = useAuth()

useTitle(computed(() => authenticateWithPassword.value || errorMessage.value !== ''
	? t('sharing.sharedProject')
	: t('sharing.authenticating')))
</script>

<style lang="scss" scoped>
.share-auth {
	display: grid;
	gap: var(--space-4);
	text-align: start;
}

.share-auth-title {
	margin: 0;
	color: var(--text-primary);
	font-size: var(--text-xl);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
}

.share-auth-form {
	display: grid;
	gap: var(--space-3);
	padding: var(--space-5);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);

	:deep(.field) {
		margin-block-end: 0;
	}
}

.share-auth-text {
	margin: 0;
	color: var(--text-secondary);
	font-size: var(--text-md);
}

.share-auth-submit {
	justify-self: stretch;
}
</style>
