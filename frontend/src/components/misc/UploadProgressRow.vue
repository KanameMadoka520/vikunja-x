<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {UploadRecord} from '@/helpers/uploadTransport'
const props = defineProps<{row: UploadRecord}>()
const {t} = useI18n({useScope: 'global'})
const finished = computed(() => ['done', 'error', 'cancelled'].includes(props.row.stage))
const percent = computed(() => props.row.total > 0 ? Math.min(100, Math.floor(props.row.loaded / props.row.total * 100)) : undefined)
const transferred = computed(() => ['processing', 'done'].includes(props.row.stage))
function size(bytes: number) {
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
	const index = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log2(Math.max(1, bytes)) / 10)))
	return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}
</script>

<template>
	<section
		class="upload-row"
		:data-stage="row.stage"
	>
		<strong>{{ row.names }}</strong>
		<span role="status">{{ t(`flow.${row.stage}`) }}</span>
		<div
			v-if="row.stage === 'uploading' || transferred"
			class="upload-metrics"
		>
			<b class="upload-percent">{{ transferred ? '100%' : percent === undefined ? '—' : `${percent}%` }}</b>
			<span class="upload-size">{{ size(row.loaded) }}<template v-if="row.total"> / {{ size(row.total) }}</template></span>
			<span
				v-if="row.stage === 'uploading'"
				class="upload-speed"
			>{{ t('flow.speed', {speed: size(row.bytesPerSecond)}) }}</span>
			<span
				v-else-if="row.averageBytesPerSecond > 0"
				class="upload-speed"
			>{{ t('flow.averageSpeed', {speed: size(row.averageBytesPerSecond)}) }}</span>
		</div>
		<progress
			v-if="!finished"
			:value="row.stage === 'uploading' && row.total ? row.loaded : undefined"
			:max="row.total || 1"
			:aria-label="t(`flow.${row.stage}`)"
		/>
		<small v-if="row.elapsedMs > 0">{{ t('flow.elapsed', {seconds: Math.floor(row.elapsedMs / 1000)}) }}</small>
		<small v-if="row.sentBytes && row.originalBytes !== row.sentBytes">{{ t('flow.convertedSize', {before: size(row.originalBytes), after: size(row.sentBytes)}) }}</small>
		<small
			v-if="row.error"
			class="upload-error"
		>{{ row.error }}</small>
	</section>
</template>

<style scoped lang="scss">
.upload-row {
	display: grid;
	gap: var(--space-1);
	min-inline-size: 0;
	padding-block: var(--space-2);
	font-size: var(--text-sm);
	overflow-wrap: anywhere;

	& + & {
		border-block-start: 1px solid var(--border-subtle);
	}

	strong {
		font-weight: var(--weight-medium);
	}

	small,
	span {
		color: var(--text-secondary);
	}

	small {
		font-size: var(--text-xs);
	}

	progress {
		inline-size: 100%;
		block-size: .25rem;
		accent-color: var(--primary);
	}

	.upload-error {
		color: var(--danger-text);
	}
}

.upload-metrics {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-1) var(--space-3);
	font-size: var(--text-xs);
	font-variant-numeric: tabular-nums;
}

.upload-percent {
	color: var(--accent-text);
	font-weight: var(--weight-semibold);
}
</style>
