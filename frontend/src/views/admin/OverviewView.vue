<template>
	<div class="settings-page admin-overview">
		<PageHeader
			:title="$t('navigation.overview')"
			:description="$t('admin.overview.description')"
		/>
		<p
			v-if="loading"
			class="admin-overview__loading"
			role="status"
		>
			{{ $t('misc.loading') }}
		</p>
		<template v-else-if="data">
			<div class="admin-overview__grid">
				<div class="admin-overview__card">
					<p class="admin-overview__card-title">
						{{ $t('admin.labels.users') }}
					</p>
					<p class="admin-overview__card-value">
						{{ data.users }}
					</p>
				</div>
				<div class="admin-overview__card">
					<p class="admin-overview__card-title">
						{{ $t('project.projects') }}
					</p>
					<p class="admin-overview__card-value">
						{{ data.projects }}
					</p>
				</div>
				<div class="admin-overview__card">
					<p class="admin-overview__card-title">
						{{ $t('admin.labels.tasks') }}
					</p>
					<p class="admin-overview__card-value">
						{{ data.tasks }}
					</p>
				</div>
				<div class="admin-overview__card">
					<p class="admin-overview__card-title">
						{{ $t('team.title') }}
					</p>
					<p class="admin-overview__card-value">
						{{ data.teams }}
					</p>
				</div>
				<div class="admin-overview__card">
					<p class="admin-overview__card-title">
						{{ $t('admin.overview.shares') }}
					</p>
					<p class="admin-overview__card-value">
						{{ totalShares }}
					</p>
					<p class="admin-overview__hint">
						{{ data.shares?.link_shares }} {{ $t('admin.overview.linkSharesShort') }}
						<span aria-hidden="true">·</span>
						{{ data.shares?.team_shares }} {{ $t('admin.overview.teamSharesShort') }}
						<span aria-hidden="true">·</span>
						{{ data.shares?.user_shares }} {{ $t('admin.overview.userSharesShort') }}
					</p>
				</div>
				<div class="admin-overview__card">
					<p class="admin-overview__card-title">
						{{ $t('admin.overview.version') }}
					</p>
					<p class="admin-overview__card-value admin-overview__card-value--version">
						{{ configStore.version }}
					</p>
				</div>
			</div>

			<Card :title="$t('admin.overview.license')">
				<dl class="admin-overview__kv">
					<dt>{{ $t('admin.overview.licenseValidUntil') }}</dt>
					<dd>
						<TimeDisplay :date="data.license?.expires_at" />
						<span
							v-if="expiresInDays !== null"
							class="admin-overview__hint"
						>
							({{ $t('admin.overview.licenseExpiresIn', {days: expiresInDays}) }})
						</span>
					</dd>
					<dt>{{ $t('admin.overview.licenseLastVerified') }}</dt>
					<dd>
						<TimeDisplay
							:date="data.license?.validated_at"
							mode="relative"
							:fallback="$t('admin.overview.licenseNever')"
						/>
						<span
							v-if="data.license?.last_check_failed"
							class="admin-overview__hint is-danger"
						>
							({{ $t('admin.overview.licenseLastCheckFailed') }})
						</span>
					</dd>
					<template v-if="data.license?.features?.length">
						<dt>{{ $t('admin.overview.licenseFeatures') }}</dt>
						<dd>{{ data.license?.features?.join(', ') }}</dd>
					</template>
					<template v-if="data.license?.instance_id">
						<dt>{{ $t('admin.overview.licenseInstance') }}</dt>
						<dd><code>{{ data.license?.instance_id }}</code></dd>
					</template>
				</dl>
				<p class="admin-overview__card-action">
					<a
						href="https://console.vikunja.io"
						target="_blank"
						rel="noopener noreferrer"
					>
						{{ $t('admin.overview.licenseManage') }}
						<Icon
							icon="arrow-up-right-from-square"
							class="admin-overview__external-icon"
						/>
					</a>
				</p>
			</Card>
		</template>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import dayjs from 'dayjs'
import Card from '@/components/misc/Card.vue'
import PageHeader from '@/components/misc/state/PageHeader.vue'
import Icon from '@/components/misc/Icon'
import TimeDisplay from '@/components/misc/TimeDisplay.vue'
import {useQuery} from '@tanstack/vue-query'
import {adminOverviewQuery} from '@/client/queries/admin'
import {useConfigStore} from '@/stores/config'

const configStore = useConfigStore()

const {data, isPending: loading} = useQuery(adminOverviewQuery())

const expiresInDays = computed<number | null>(() => {
	const expires_at = data.value?.license?.expires_at
	if (!expires_at) return null
	return Math.max(0, dayjs(expires_at).diff(dayjs(), 'day'))
})

const totalShares = computed<number>(() => {
	const shares = data.value?.shares
	if (!shares) return 0
	return (shares.link_shares ?? 0) + (shares.team_shares ?? 0) + (shares.user_shares ?? 0)
})

</script>

<style lang="scss" scoped>
.admin-overview__loading {
	color: var(--text-secondary);
}

.admin-overview__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
	gap: var(--space-3);
	margin-block-end: var(--space-5);
}

.admin-overview__card {
	display: grid;
	align-content: start;
	gap: var(--space-1);
	min-inline-size: 0;
	padding: var(--space-3) var(--space-4);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	background: var(--surface);
	box-shadow: var(--elevation-1);
}

.admin-overview__card-title {
	color: var(--text-secondary);
	font-size: var(--text-sm);
	font-weight: var(--weight-medium);
}

.admin-overview__card-value {
	color: var(--text-primary);
	font-size: var(--text-2xl);
	font-weight: var(--weight-semibold);
	font-variant-numeric: tabular-nums;
	line-height: var(--leading-tight);
}

.admin-overview__card-value--version {
	font-size: var(--text-md);
	font-family: var(--font-mono);
	overflow-wrap: anywhere;
}

.admin-overview__kv {
	display: grid;
	grid-template-columns: max-content minmax(0, 1fr);
	gap: var(--space-1) var(--space-4);
	font-size: var(--text-md);

	dt {
		color: var(--text-secondary);
		font-weight: var(--weight-medium);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	@media screen and (max-width: $tablet) {
		grid-template-columns: minmax(0, 1fr);

		dd + dt {
			margin-block-start: var(--space-2);
		}
	}
}

.admin-overview__hint {
	color: var(--text-tertiary);
	font-size: var(--text-xs);

	&.is-danger {
		color: var(--danger-text);
	}
}

.admin-overview__card-action {
	margin-block-start: var(--space-4);
}

.admin-overview__external-icon {
	margin-inline-start: var(--space-1);
	font-size: var(--text-xs);
	opacity: .7;
}
</style>
