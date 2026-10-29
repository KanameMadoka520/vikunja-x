<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {useI18n} from 'vue-i18n'
import {barkQuery, useSaveBark, useTestBark} from '@/client/queries/bark'
import type {BarkSaveData} from '@/client/generated'
import {useTitle} from '@/composables/useTitle'
defineOptions({name: 'BarkSettingsPage'})
const {t} = useI18n({useScope: 'global'})
useTitle(() => t('bark.title'))
const query = useQuery(barkQuery())
const draft = ref<BarkSaveData['body']>()
const baseline = ref('')
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const save = useSaveBark()
const test = useTestBark()
const error = ref('')
function adopt(value: NonNullable<typeof query.data.value>) {
	const {has_key: _hasKey, ...settings} = value.settings ?? {}
	draft.value = {...settings, device_key: ''}
	baseline.value = JSON.stringify(draft.value)
}
watch(query.data, value => {if (value && (!draft.value || !dirty.value)) adopt(value)}, {immediate: true})
async function submit() {
	if (!draft.value || save.isPending.value) return
	error.value = ''
	try {adopt(await save.mutateAsync({...draft.value}))} catch {error.value = t('bark.saveFailed')}
}
async function sendTest() {
	if (dirty.value || test.isPending.value) return
	error.value = ''
	try {await test.mutateAsync()} catch {error.value = t('bark.testFailed')}
}
const endpoint = computed(() => (draft.value?.server_url ?? '').replace(/\/+$/, '') + '/push')
</script>

<template>
	<Card :title="t('bark.title')">
		<p>{{ t('bark.intro') }}</p>
		<p class="notification">
			{{ t('bark.reminderHint') }}
		</p>
		<p
			v-if="query.isError.value"
			role="alert"
		>
			{{ t('bark.loadFailed') }}
		</p>
		<form
			v-if="draft"
			class="bark-settings"
			@submit.prevent="submit"
		>
			<fieldset :disabled="save.isPending.value || test.isPending.value">
				<label><input
					v-model="draft.enabled"
					type="checkbox"
				> {{ t('bark.enabled') }}</label>
				<label>{{ t('bark.server') }}<input
					v-model="draft.server_url"
					class="input"
					type="url"
					required
					placeholder="https://api.day.app"
					autocomplete="off"
				></label>
				<label>{{ t('bark.key') }}<input
					v-model="draft.device_key"
					class="input"
					type="password"
					autocomplete="new-password"
					:placeholder="t(query.data.value?.settings?.has_key ? 'bark.keySaved' : 'bark.keyEmpty')"
				></label>
				<p class="help">
					{{ t('bark.keyHelp') }}
				</p>
				<label>{{ t('bark.scope') }}<select
					v-model="draft.scope"
					class="select"
				><option value="reminders">{{ t('bark.reminders') }}</option><option value="all">{{ t('bark.all') }}</option></select></label>
				<label>{{ t('bark.level') }}<select
					v-model="draft.level"
					class="select"
				><option value="timeSensitive">{{ t('bark.timeSensitive') }}</option><option value="active">{{ t('bark.active') }}</option><option value="passive">{{ t('bark.passive') }}</option></select></label>
				<label>{{ t('bark.language') }}<select
					v-model="draft.language"
					class="select"
				><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
				<label><input
					v-model="draft.preview"
					type="checkbox"
				> {{ t('bark.preview') }}</label>
				<p class="help">
					{{ t('bark.privacy') }}
				</p>
				<p>{{ t('bark.endpoint') }}<code>{{ endpoint }}</code></p>
				<div class="bark-actions">
					<XButton
						type="submit"
						:loading="save.isPending.value"
					>
						{{ t('bark.save') }}
					</XButton><XButton
						variant="secondary"
						:disabled="dirty || !query.data.value?.settings?.has_key"
						:loading="test.isPending.value"
						@click="sendTest"
					>
						{{ t('bark.test') }}
					</XButton>
				</div>
			</fieldset>
			<p
				v-if="dirty"
				class="help"
			>
				{{ t('bark.saveFirst') }}
			</p>
			<p
				v-if="error"
				role="alert"
			>
				{{ error }}
			</p>
		</form>
		<details class="bark-guide">
			<summary>{{ t('bark.guide') }}</summary><ol><li>{{ t('bark.step1') }}</li><li>{{ t('bark.step2') }}</li><li>{{ t('bark.step3') }}</li></ol><p>{{ t('bark.deliveryHint') }}</p><a
				href="https://github.com/Finb/Bark/blob/master/docs/tutorial.md"
				target="_blank"
				rel="noopener noreferrer"
			>{{ t('bark.docs') }}</a>
		</details>
		<h3>{{ t('bark.recent') }}</h3>
		<p>{{ t('bark.acceptedHint') }}</p>
		<p v-if="!query.data.value?.deliveries?.length">
			{{ t('bark.empty') }}
		</p>
		<ul
			v-else
			class="bark-deliveries"
		>
			<li
				v-for="(delivery, index) in query.data.value.deliveries"
				:key="`${delivery.notification_id}-${index}`"
			>
				<strong>{{ delivery.notification_id ? t('bark.notification', {id: delivery.notification_id}) : t('bark.testDelivery') }} · {{ t(`bark.status_${delivery.status}`) }}</strong>
				<span>{{ new Date(delivery.updated!).toLocaleString() }} · {{ t('bark.attempts', {count: delivery.attempts}) }}</span>
				<span v-if="delivery.error">{{ t('bark.errorCode') }}: <code>{{ delivery.error }}</code></span>
				<span v-if="delivery.status === 'pending' && delivery.attempts">{{ t('bark.next') }}: {{ new Date(delivery.next!).toLocaleString() }}</span>
			</li>
		</ul>
	</Card>
</template>

<style scoped lang="scss">
.bark-settings fieldset {
	border: 0;
	padding: 0;
	margin: 1rem 0;
	display: grid;
	gap: 1rem;
	min-inline-size: 0;
	}
.bark-settings label {
	display: block;
	}
.bark-settings .input, .bark-settings .select {
	display: block;
	inline-size: 100%;
	max-inline-size: 36rem;
	margin-block-start: .35rem;
	}
.bark-settings code {
	display: block;
	overflow-wrap: anywhere;
	}
.bark-actions {
	display: flex;
	flex-wrap: wrap;
	gap: .75rem;
	}
.bark-guide {
	margin-block: 1.5rem;
	}
.bark-guide summary {
	cursor: pointer;
	}
.bark-deliveries {
	list-style: none;
	padding: 0;
	}
.bark-deliveries li {
	display: grid;
	gap: .4rem;
	padding-block: .75rem;
	border-block-end: 1px solid var(--grey-200);
	overflow-wrap: anywhere;
	}
</style>
