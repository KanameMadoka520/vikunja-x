<template>
	<div class="settings-page">
		<PageHeader
			:title="$t('migrate.title')"
			:description="$t('migrate.description')"
		/>
		<Card>
			<div class="migration-services">
				<RouterLink
					v-for="{name, id, icon, kind} in availableMigrators"
					:key="id"
					class="migration-service-link"
					:to="kind === 'csv' ? {name: 'migrate.csv'} : {name: 'migrate.service', params: {service: id}}"
				>
					<img
						class="migration-service-image"
						alt=""
						:src="icon"
					>
					<span class="migration-service-name">{{ name }}</span>
				</RouterLink>
			</div>
		</Card>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'

import {MIGRATORS, type Migrator} from './migrators'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import {useTitle} from '@/composables/useTitle'
import {useConfigStore} from '@/stores/config'

const {t} = useI18n({useScope: 'global'})

useTitle(() => `${t('migrate.title')} - ${t('user.settings.title')}`)

const configStore = useConfigStore()
const availableMigrators = computed(() => configStore.available_migrators
	.filter((id): id is keyof typeof MIGRATORS => Object.prototype.hasOwnProperty.call(MIGRATORS, id))
	.map((id): Migrator => MIGRATORS[id]),
)
</script>

<style lang="scss" scoped>
.migration-services {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
	gap: var(--space-3);
}

.migration-service-link {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-end;
	gap: var(--space-2);
	min-block-size: 7.5rem;
	padding: var(--space-3);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	color: var(--text-primary);
	font-size: var(--text-md);
	font-weight: var(--weight-medium);
	text-align: center;
	text-transform: capitalize;
	transition:
		border-color var(--motion-fast) var(--ease-standard),
		background-color var(--motion-fast) var(--ease-standard);

	&:hover {
		border-color: var(--border-strong);
		background-color: var(--surface-hover);
	}

	&:focus-visible {
		@include focus-ring;
	}
}

.migration-service-image {
	display: block;
	max-block-size: 3.5rem;
	max-inline-size: 100%;
	inline-size: auto;
}

.migration-service-name {
	overflow-wrap: anywhere;
}
</style>
