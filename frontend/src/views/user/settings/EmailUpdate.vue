<template>
	<div
		v-if="isLocalUser"
		class="settings-page"
	>
		<PageHeader
			:title="$t('user.settings.updateEmailTitle')"
			:description="$t('user.settings.emailDescription')"
		/>
		<Card>
			<div
				class="current-email"
				data-cy="current-email"
			>
				<strong>{{ $t('user.settings.currentEmail') }}</strong>
				<p class="current-email__address">
					{{ authStore.info?.email }}
				</p>
				<p class="current-email__help">
					{{ $t('user.settings.currentEmailHelp') }} <RouterLink :to="{name: 'user.settings.general'}">
						{{ $t('user.settings.general.title') }}
					</RouterLink>
				</p>
			</div>
			<Message
				v-if="pendingEmail"
				variant="warning"
				role="status"
				class="mbe-4"
			>
				<p>{{ $t('user.settings.updateEmailPending', {email: pendingEmail}) }}</p>
				<div class="buttons mbs-2">
					<XButton
						variant="secondary"
						:loading="pendingAction === 'resend'"
						:disabled="pendingAction !== null && pendingAction !== 'resend'"
						@click="resendConfirmation"
					>
						{{ $t('user.settings.updateEmailResend') }}
					</XButton>
					<XButton
						variant="tertiary"
						:loading="pendingAction === 'cancel'"
						:disabled="pendingAction !== null && pendingAction !== 'cancel'"
						@click="cancelEmailUpdate"
					>
						{{ $t('user.settings.updateEmailCancel') }}
					</XButton>
				</div>
			</Message>
			<form @submit.prevent="updateEmail">
				<FormField
					id="newEmail"
					v-model="emailUpdate.new_email"
					:label="$t('user.settings.updateEmailNew')"
					:placeholder="$t('user.auth.emailPlaceholder')"
					type="email"
					name="email"
					autocomplete="email"
					@keyup.enter="updateEmail"
				/>
				<FormField
					id="currentPasswordEmail"
					v-model="emailUpdate.password"
					:label="$t('user.settings.currentPassword')"
					:placeholder="$t('user.settings.currentPasswordPlaceholder')"
					type="password"
					name="current-password"
					autocomplete="current-password"
					@keyup.enter="updateEmail"
				/>
			</form>
			<template #footer>
				<XButton
					:loading="pendingAction === 'save'"
					:disabled="pendingAction !== null && pendingAction !== 'save'"
					@click="updateEmail"
				>
					{{ $t('misc.save') }}
				</XButton>
			</template>
		</Card>
	</div>
</template>




<script setup lang="ts">
import {reactive, computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'

import {useUpdateEmailMutation, useCancelEmailUpdateMutation, useResendEmailConfirmationMutation} from '@/client/queries/email'
import FormField from '@/components/input/FormField.vue'
import Message from '@/components/misc/Message.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import {AUTH_TYPES} from '@/constants/auth'

defineOptions({name: 'UserSettingsUpdateEmail'})

const {t} = useI18n({useScope: 'global'})
useTitle(() => `${t('user.settings.updateEmailTitle')} - ${t('user.settings.title')}`)

const authStore = useAuthStore()
const isLocalUser = computed(() => authStore.info?.is_local_user)
const pendingEmail = computed(() => authStore.info?.pending_email)
const identity = computed(() => ({
	id: authStore.session?.id ?? 0,
	type: authStore.session?.type ?? AUTH_TYPES.USER,
}))

const emailUpdate = reactive({new_email: '', password: ''})
const updateMutation = useUpdateEmailMutation()
const cancelMutation = useCancelEmailUpdateMutation()
const resendMutation = useResendEmailConfirmationMutation()
const pendingAction = ref<'save' | 'resend' | 'cancel' | null>(null)

async function runAction(name: 'save' | 'resend' | 'cancel', fn: () => Promise<void>) {
	if (pendingAction.value !== null) {
		return
	}
	pendingAction.value = name
	try {
		await fn()
	} catch {
		return
	} finally {
		pendingAction.value = null
	}
}

function updateEmail() {
	return runAction('save', async () => {
		const submitted = {...emailUpdate}
		await updateMutation.mutateAsync({
			...identity.value,
			body: submitted,
		})
		if (emailUpdate.new_email === submitted.new_email) {
			emailUpdate.new_email = ''
		}
		if (emailUpdate.password === submitted.password) {
			emailUpdate.password = ''
		}
	})
}

function resendConfirmation() {
	return runAction('resend', async () => {
		await resendMutation.mutateAsync(identity.value)
	})
}

function cancelEmailUpdate() {
	return runAction('cancel', async () => {
		await cancelMutation.mutateAsync(identity.value)
	})
}
</script>

<style lang="scss" scoped>
.current-email {
	display: grid;
	gap: var(--space-1);
	margin-block-end: var(--space-5);
	padding-block-end: var(--space-4);
	border-block-end: 1px solid var(--border-subtle);
}

.current-email__address {
	font-size: var(--text-base);
	overflow-wrap: anywhere;
}

.current-email__help {
	color: var(--text-secondary);
	font-size: var(--text-sm);
}
</style>
