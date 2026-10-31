<template>
	<div class="settings-page data-export-download">
		<PageHeader
			:title="$t('user.export.downloadTitle')"
			:description="isLocalUser ? $t('user.export.descriptionPasswordRequired') : ''"
		/>
		<Card>
			<form
				v-if="isLocalUser"
				@submit.prevent="download()"
			>
				<FormField
					id="currentPasswordDataExport"
					ref="passwordInput"
					v-model="password"
					:label="$t('user.settings.currentPassword')"
					:class="{'is-danger': errPasswordRequired}"
					:placeholder="$t('user.settings.currentPasswordPlaceholder')"
					type="password"
					autocomplete="current-password"
					:error="errPasswordRequired ? $t('user.deletion.passwordRequired') : null"
					@keyup="() => errPasswordRequired = password === ''"
				/>
			</form>
			<template #footer>
				<div class="data-export-download__actions">
					<XButton
						v-focus
						:loading="downloadMutation.isPending.value"
						icon="download"
						@click="download()"
					>
						{{ $t('misc.download') }}
					</XButton>
					<XButton
						:to="{name:'user.settings.data-export'}"
						variant="tertiary"
					>
						{{ $t('user.export.requestNew') }}
					</XButton>
				</div>
			</template>
		</Card>
	</div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import {useDownloadExportMutation} from '@/client/queries/dataExport'
import FormField from '@/components/input/FormField.vue'
import Card from '@/components/misc/Card.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import {useAuthStore} from '@/stores/auth'

const downloadMutation = useDownloadExportMutation()
const password = ref('')
const errPasswordRequired = ref(false)
const passwordInput = ref<InstanceType<typeof FormField>>()

const authStore = useAuthStore()
const isLocalUser = computed(() => authStore.info?.is_local_user)

function download() {
	if (password.value === '' && isLocalUser.value) {
		errPasswordRequired.value = true
		passwordInput.value?.focus()
		return
	}

	downloadMutation.mutate(password.value)
}
</script>

<style lang="scss" scoped>
.data-export-download__actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}
</style>
