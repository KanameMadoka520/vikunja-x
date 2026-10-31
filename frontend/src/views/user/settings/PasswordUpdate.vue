<template>
	<div
		v-if="isLocalUser"
		class="settings-page"
	>
		<PageHeader
			:title="$t('user.settings.newPasswordTitle')"
			:description="$t('user.settings.passwordDescription')"
		/>
		<Card :loading="passwordUpdateMutation.isPending.value">
			<form
				class="settings-form"
				@submit.prevent="updatePassword"
			>
				<div class="field">
					<label
						class="label"
						for="password"
					>{{ $t('user.settings.newPassword') }}</label>
					<Password
						:validate-initially="true"
						@submit="updatePassword"
						@update:modelValue="v => passwordUpdate.new_password = v"
					/>
				</div>
				<FormField
					id="currentPassword"
					v-model="passwordUpdate.old_password"
					:label="$t('user.settings.currentPassword')"
					autocomplete="current-password"
					:placeholder="$t('user.settings.currentPasswordPlaceholder')"
					type="password"
					@keyup.enter="updatePassword"
				/>
			</form>
			<template #footer>
				<XButton
					:loading="passwordUpdateMutation.isPending.value"
					:disabled="!isValid"
					@click="updatePassword"
				>
					{{ $t('misc.save') }}
				</XButton>
			</template>
		</Card>
	</div>
</template>


<script setup lang="ts">
import {reactive, computed} from 'vue'
import {useI18n} from 'vue-i18n'

import {useChangePasswordMutation} from '@/client/queries/passwords'
import FormField from '@/components/input/FormField.vue'
import Password from '@/components/input/Password.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'

import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import {validatePassword} from '@/helpers/validatePasswort'

defineOptions({name: 'UserSettingsPasswordUpdate'})

const passwordUpdateMutation = useChangePasswordMutation()
const passwordUpdate = reactive({new_password: '', old_password: ''})

const {t} = useI18n({useScope: 'global'})
useTitle(() => `${t('user.settings.newPasswordTitle')} - ${t('user.settings.title')}`)

const authStore = useAuthStore()
const isLocalUser = computed(() => authStore.info?.is_local_user)
const isValid = computed(() => validatePassword(passwordUpdate.new_password) === true && passwordUpdate.old_password !== '')

function updatePassword() {
	if (!isValid.value || passwordUpdateMutation.isPending.value) return
	passwordUpdateMutation.mutate(passwordUpdate)
}
</script>
