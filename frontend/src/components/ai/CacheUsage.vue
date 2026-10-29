<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {Usage} from '@/client/generated'

const props = defineProps<{usages: (Usage | undefined)[]}>()
const {t} = useI18n({useScope: 'global'})
const stats = computed(() => {
	let input = 0, cached = 0, measured = 0
	for (const usage of props.usages) {
		if (!usage?.reported || !usage.cache_reported || usage.input == null || usage.cached == null || usage.input < 0 || usage.cached < 0 || usage.cached > usage.input) continue
		input += usage.input
		cached += usage.cached
		measured++
	}
	return {input, cached, uncached: input - cached, measured, partial: measured < props.usages.length, rate: input > 0 ? (cached / input * 100).toFixed(1) : null}
})
</script>

<template>
	<div
		class="cache-usage"
		data-testid="cache-usage"
	>
		<template v-if="stats.measured">
			<span>{{ t('cacheEfficiency.hitRate') }}: <strong>{{ stats.rate == null ? '—' : `${stats.rate}%` }}</strong></span>
			<span>{{ t('cacheEfficiency.read') }}: {{ stats.cached.toLocaleString() }} / {{ stats.input.toLocaleString() }} tokens</span>
			<span>{{ t('cacheEfficiency.uncached') }}: <strong>{{ stats.uncached.toLocaleString() }}</strong> tokens</span>
			<small>{{ t('cacheEfficiency.explanation') }}<template v-if="stats.partial"> {{ t('cacheEfficiency.partial', {reported: stats.measured, total: usages.length}) }}</template></small>
		</template>
		<span v-else>{{ t('cacheEfficiency.unreported') }}</span>
	</div>
</template>

<style scoped lang="scss">
.cache-usage {
	display: flex;
	flex-wrap: wrap;
	gap: .25rem .85rem;
	font-size: .8rem;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;

	small {
		flex-basis: 100%;
		color: var(--grey-600);
	}
}
</style>
