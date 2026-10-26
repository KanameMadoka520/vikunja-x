<script setup lang="ts">
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {useDocumentVisibility} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import {systemStatusQuery} from '@/client/queries/systemStatus'
import {useBaseStore} from '@/stores/base'
const {t} = useI18n({useScope: 'global'})
const base = useBaseStore()
const visibility = useDocumentVisibility()
const query = useQuery(computed(() => systemStatusQuery(base.menuActive && visibility.value === 'visible')))
const data = computed(() => query.data.value)
const state = computed(() => query.isError.value ? 'offline' : !data.value ? 'loading' : data.value.healthy ? 'healthy' : 'degraded')
function bytes(n?: number | null) {
	if (n == null) return '—'
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
	const index = Math.min(4, Math.max(0, Math.floor(Math.log2(Math.max(1, n)) / 10)))
	return `${(n / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}
function ratio(used?: number | null, total?: number | null) {return used != null && total ? used / total * 100 : null}
const rows = computed(() => [
	{key: 'cpu', percent: data.value?.cpu_percent, detail: data.value?.cpu_cores ? t('systemStatus.cores', {n: data.value.cpu_cores}) : '—'},
	{key: 'memory', percent: ratio(data.value?.memory_used, data.value?.memory_total), detail: `${bytes(data.value?.memory_used)} / ${bytes(data.value?.memory_total)}`},
	{key: 'disk', percent: ratio(data.value?.disk_used, data.value?.disk_total), detail: `${bytes(data.value?.disk_used)} / ${bytes(data.value?.disk_total)}`},
])
const uptime = computed(() => {
	const seconds = data.value?.uptime_seconds ?? 0
	return t('systemStatus.duration', {days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60)})
})
</script>

<template>
	<section
		class="system-status"
		:aria-label="t('systemStatus.title')"
	>
		<div class="status-heading">
			<strong>{{ t('systemStatus.title') }}</strong><span :class="state">{{ t(`systemStatus.${state}`) }}</span>
		</div>
		<template v-if="data">
			<div
				v-for="row in rows"
				:key="row.key"
				class="resource-row"
				:title="row.detail"
			>
				<span>{{ t(`systemStatus.${row.key}`) }}</span><span class="resource-value">{{ row.percent == null ? t('systemStatus.unavailable') : `${row.percent.toFixed(1)}%` }}</span>
				<progress
					:aria-label="t(`systemStatus.${row.key}`)"
					:value="row.percent == null ? 0 : Math.min(100, row.percent)"
					max="100"
				/>
				<small>{{ row.detail }}</small>
			</div>
			<div class="runtime">
				<span>{{ t('systemStatus.uptime', {duration: uptime}) }}</span><a
					:href="`https://github.com/KanameMadoka520/vikunja-x/releases/tag/${data.version}`"
					target="_blank"
					rel="noopener noreferrer"
				>{{ data.version }}</a>
			</div>
			<details><summary>{{ t('systemStatus.measurement') }}</summary><p>{{ t('systemStatus.cpuHelp') }} {{ t(data.cpu_limited ? 'systemStatus.cpuLimited' : 'systemStatus.cpuShared') }}</p><p>{{ t(data.memory_limited ? 'systemStatus.memoryLimited' : 'systemStatus.memoryShared') }}</p><p>{{ t('systemStatus.diskHelp') }}</p><p>{{ t('systemStatus.refreshHelp') }}</p><p>{{ t('systemStatus.sampled') }} {{ data.sampled ? new Date(data.sampled).toLocaleString() : '—' }}</p></details>
		</template>
		<button
			v-if="query.isError.value"
			type="button"
			@click="query.refetch()"
		>
			{{ t('loadingError.tryAgain') }}
		</button>
	</section>
</template>

<style scoped lang="scss">
.system-status {
 margin: .75rem 1rem .25rem;
 padding-block-start: .75rem;
 border-block-start: 1px solid var(--grey-200);
 font-size: .72rem;
 color: var(--text);
}
.status-heading, .runtime {display: flex;
align-items: center;
justify-content: space-between;
gap: .35rem;
flex-wrap: wrap;}
.status-heading {margin-block-end: .55rem;}
.healthy {color: var(--success);}
.offline, .degraded {color: var(--danger);}
.resource-row {display: grid;
grid-template-columns: auto 1fr auto;
align-items: center;
gap: .2rem .5rem;
margin-block-end: .45rem;}
.resource-value {text-align: end;}
.resource-row progress {inline-size: 3rem;
block-size: .3rem;
accent-color: var(--primary);}
.resource-row small {grid-column: 1 / -1;
color: var(--grey-600);
overflow-wrap: anywhere;}
.runtime {font-size: .68rem;
color: var(--grey-600);}
.runtime a {overflow-wrap: anywhere;}
summary {cursor: pointer;
color: var(--grey-600);
margin-block-start: .5rem;}
details p {margin-block: .4rem;
line-height: 1.5;}
button {background: transparent;
border: 0;
color: var(--link);
cursor: pointer;}
</style>
