<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {useI18n} from 'vue-i18n'
import {mailSettingsAccessQuery, mailSettingsQuery, useSaveMailSettings} from '@/client/queries/mailSettings'
import type {MailSettings, MailSettingsWritable} from '@/client/generated'
import {useTitle} from '@/composables/useTitle'
import {isRequestContextAbort} from '@/client/requestContext'
const {t} = useI18n({useScope: 'global'})
useTitle(() => t('mailServer.title'))
const access = useQuery(mailSettingsAccessQuery())
const allowed = computed(() => access.data.value?.can_manage_mail === true)
const settings = useQuery({...mailSettingsQuery(), enabled: allowed})
const draft = ref<MailSettings & MailSettingsWritable>()
const baseline = ref('')
const dirty = computed(() => draft.value !== undefined && JSON.stringify(draft.value) !== baseline.value)
const errorMessage = ref('')
function adopt(value: MailSettings) {
	draft.value = {...value, password: '', clear_password: false}
	baseline.value = JSON.stringify(draft.value)
}
watch(settings.data, value => { if (value && !dirty.value) adopt(value) }, {immediate: true})
const save = useSaveMailSettings()
async function submit() {
	if (!draft.value || save.isPending.value) return
	errorMessage.value = ''
	const submitted = JSON.stringify(draft.value)
	try {
		const result = await save.mutateAsync({...draft.value})
		if (JSON.stringify(draft.value) === submitted) adopt(result)
		else { baseline.value = JSON.stringify({...result, password: '', clear_password: false}); draft.value.revision = result.revision }
	} catch (error) {
		if (!isRequestContextAbort(error)) errorMessage.value = error instanceof Error ? error.message : t('settingsDraft.failed')
	}
}
</script>

<template>
	<Card :title="t('mailServer.title')">
		<p v-if="access.isPending.value || (allowed && settings.isPending.value)">
			{{ t('mailServer.loading') }}
		</p>
		<p
			v-else-if="access.isError.value || (allowed && settings.isError.value)"
			role="alert"
		>
			{{ t('mailServer.loadFailed') }}
		</p>
		<p
			v-else-if="!allowed"
			role="alert"
		>
			{{ t('mailServer.forbidden') }}
		</p>
		<form
			v-else-if="draft"
			class="mail-settings"
			@submit.prevent="submit"
		>
			<p>{{ t('mailServer.intro') }}</p>
			<p>
				{{ t('mailServer.recipient') }} <RouterLink :to="{name: 'user.settings.email-update'}">
					{{ t('mailServer.emailLink') }}
				</RouterLink>
			</p>
			<p class="notification">
				{{ t(draft.source === 'saved' ? 'mailServer.sourceSaved' : 'mailServer.sourceEnvironment') }} {{ t('mailServer.revision') }}: {{ draft.revision }}
			</p>
			<label><input
				v-model="draft.enabled"
				type="checkbox"
			> {{ t('mailServer.enabled') }}</label>
			<div class="mail-fields">
				<label>{{ t('mailServer.host') }}<input
					v-model="draft.host"
					class="input"
					:required="draft.enabled"
					autocomplete="off"
					placeholder="smtp.example.com"
					maxlength="253"
				></label>
				<label>{{ t('mailServer.port') }}<input
					v-model.number="draft.port"
					class="input"
					type="number"
					required
					min="1"
					max="65535"
				></label>
				<label>{{ t('mailServer.username') }}<input
					v-model="draft.username"
					class="input"
					autocomplete="off"
					maxlength="320"
				></label>
				<label>{{ t('mailServer.password') }}<input
					v-model="draft.password"
					class="input"
					type="password"
					autocomplete="new-password"
					:disabled="draft.clear_password"
					:placeholder="t(draft.has_password ? 'mailServer.savedPassword' : 'mailServer.emptyPassword')"
					maxlength="4096"
				></label>
				<label>{{ t('mailServer.from') }}<input
					v-model="draft.from_email"
					class="input"
					:required="draft.enabled"
					maxlength="320"
					placeholder="no-reply@example.com"
				></label>
				<label>{{ t('mailServer.auth') }}<select
					v-model="draft.auth_type"
					class="input"
				><option value="plain">PLAIN</option><option value="login">LOGIN</option><option value="cram-md5">CRAM-MD5</option><option value="none">{{ t('mailServer.none') }}</option></select></label>
				<label>{{ t('mailServer.tls') }}<select
					v-model="draft.tls_mode"
					class="input"
				><option value="auto">{{ t('mailServer.auto') }}</option><option value="starttls">{{ t('mailServer.starttls') }}</option><option value="tls">{{ t('mailServer.implicit') }}</option></select></label>
			</div>
			<p class="help">
				{{ t('mailServer.passwordHelp') }}
			</p>
			<label v-if="draft.has_password"><input
				v-model="draft.clear_password"
				type="checkbox"
			> {{ t('mailServer.clearPassword') }}</label>
			<label><input
				v-model="draft.skip_tls_verify"
				type="checkbox"
			> {{ t('mailServer.skipVerify') }}</label>
			<p class="help">
				{{ t('mailServer.tlsHelp') }}
			</p>
			<p>{{ t('mailServer.saveHelp') }}</p>
			<p
				v-if="dirty"
				role="status"
			>
				{{ t('settingsDraft.unsaved') }}
			</p>
			<p
				v-if="errorMessage"
				class="notification is-danger"
				role="alert"
			>
				{{ t('settingsDraft.retained') }} {{ errorMessage }}
			</p>
			<XButton
				:loading="save.isPending.value"
				:disabled="save.isPending.value || !dirty"
				@click="submit"
			>
				{{ t('mailServer.save') }}
			</XButton>
		</form>
	</Card>
</template>

<style scoped lang="scss">
.mail-settings {
 display: grid;
 gap: 1rem;
}
.mail-fields {
 display: grid;
 grid-template-columns: repeat(2, minmax(0, 1fr));
 gap: 1rem;
}
.mail-fields label {
 display: flex;
 flex-direction: column;
 gap: .4rem;
}
@media (width <= 600px) {
 .mail-fields {
  grid-template-columns: 1fr;
 }
}
</style>
