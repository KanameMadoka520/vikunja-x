<template>
	<div>
		<Message
			v-if="errorMsg"
			variant="danger"
			class="mbe-4"
		>
			{{ errorMsg }}
		</Message>
		<div
			v-if="successMessage"
			class="auth-success has-text-centered mbe-4"
		>
			<Message variant="success">
				{{ successMessage }}
			</Message>
			<XButton :to="{ name: 'user.login' }">
				{{ $t('user.auth.login') }}
			</XButton>
		</div>
		<form
			v-if="!successMessage"
			id="form"
			@submit.prevent="resetPassword"
		>
			<div class="field">
				<label
					class="label"
					for="password"
				>{{ $t('user.auth.password') }}</label>
				<Password
					@submit="resetPassword"
					@update:modelValue="v => credentials.password = v"
				/>
			</div>

			<div class="auth-actions">
				<XButton
					:loading="passwordResetMutation.isPending.value"
					class="is-fullwidth"
					@click="resetPassword"
				>
					{{ $t('user.auth.resetPassword') }}
				</XButton>
			</div>
		</form>
	</div>
</template>

<script setup lang="ts">
import {ref, reactive} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'

import {useResetPasswordMutation} from '@/client/queries/passwords'
import {isRequestContextAbort} from '@/client/requestContext'
import Message from '@/components/misc/Message.vue'
import {getErrorText} from '@/message'
import Password from '@/components/input/Password.vue'
import {getSensitiveParam} from '@/helpers/sensitiveQueryParams'

const credentials = reactive({
	password: '',
})

const route = useRoute()
const {t} = useI18n()

const passwordResetMutation = useResetPasswordMutation()
const errorMsg = ref('')
const successMessage = ref('')

async function resetPassword() {
	if (passwordResetMutation.isPending.value) return

	errorMsg.value = ''
	const token = getSensitiveParam(route, 'userPasswordReset')

	if (!token) {
		errorMsg.value = t('user.auth.passwordResetTokenMissing')
		return
	}

	if (credentials.password === '') {
		return
	}

	try {
		const {message} = await passwordResetMutation.mutateAsync({new_password: credentials.password, token})
		successMessage.value = message ?? t('user.settings.passwordUpdateSuccess')
		credentials.password = ''
	} catch (e) {
		if (isRequestContextAbort(e)) return
		errorMsg.value = getErrorText(e)
	}
}
</script>

<style lang="scss" scoped>
.auth-actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	margin-block-start: var(--space-4);
}

.auth-success {
	display: grid;
	gap: var(--space-4);

	.button {
		justify-self: center;
	}
}
</style>
