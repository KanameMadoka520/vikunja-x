<template>
	<div class="not-found">
		<Icon
			:icon="['far', 'circle-question']"
			class="not-found__icon"
			aria-hidden="true"
		/>
		<h1 class="not-found__title">
			{{ $t('404.title') }}
		</h1>
		<p class="not-found__text">
			{{ $t('404.text') }}
		</p>
		<div class="not-found__actions">
			<XButton
				:to="{name: 'home'}"
				icon="house"
			>
				{{ $t('home.goToOverview') }}
			</XButton>
			<XButton
				v-if="authStore.authenticated"
				variant="secondary"
				icon="search"
				:shadow="false"
				@click="baseStore.setQuickActionsActive(true)"
			>
				{{ $t('navigation.search') }}
			</XButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'

import {useTitle} from '@/composables/useTitle'
import {useAuthStore} from '@/stores/auth'
import {useBaseStore} from '@/stores/base'

const {t} = useI18n({useScope: 'global'})
useTitle(() => t('404.title'))

const authStore = useAuthStore()
const baseStore = useBaseStore()
</script>

<style lang="scss" scoped>
.not-found {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--space-2);
	max-inline-size: var(--page-narrow-width);
	margin: var(--space-8) auto 0;
	padding: var(--space-6);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
}

.not-found__icon {
	color: var(--text-tertiary);
	font-size: var(--text-xl);
}

.not-found__title {
	margin: 0;
	font-size: var(--text-xl);
}

.not-found__text {
	color: var(--text-secondary);
}

.not-found__actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	margin-block-start: var(--space-2);
}
</style>
