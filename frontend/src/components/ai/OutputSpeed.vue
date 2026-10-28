<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ModelStep} from '@/client/generated'
import {outputSpeed} from '@/helpers/outputSpeed'
const props = withDefaults(defineProps<{step?: ModelStep}>(), {step: undefined})
const {t, n} = useI18n({useScope: 'global'})
const speed = computed(() => outputSpeed(props.step))
</script>

<template>
	<details class="output-speed">
		<summary>
			{{ t(`outputSpeed.${speed.rate == null ? 'stream' : speed.mode}`) }}:
			<strong v-if="speed.rate != null">{{ n(speed.rate, {maximumFractionDigits: 1, minimumFractionDigits: 1}) }} tokens/s</strong>
			<span v-else>{{ t('outputSpeed.unavailable') }}</span>
		</summary>
		<div class="speed-explanation">
			<p v-if="speed.rate == null">
				{{ t(`outputSpeed.${speed.reason}`) }}
			</p>
			<template v-else>
				<p>{{ t(`outputSpeed.${speed.mode}Help`) }}</p>
				<p class="speed-calculation">
					{{ speed.mode === 'request' ? n(speed.tokens) : `(${n(speed.tokens)} − 1)` }} ÷ {{ n(speed.durationMs / 1000, {maximumFractionDigits: 3}) }} s
				</p>
			</template>
			<p>{{ t('outputSpeed.scope', {model: step?.model || t('chat.unavailable')}) }}</p>
		</div>
	</details>
</template>

<style scoped lang="scss">
.output-speed {
 margin-block: .75rem;
 color: var(--text-light);
 font-size: .75rem;
 font-variant-numeric: tabular-nums;
 overflow-wrap: anywhere;
}
summary {
 cursor: pointer;
 padding-block: .3rem;
}
strong {
 font-weight: 500;
 color: var(--text);
}
.speed-explanation {
 margin-block-start: .4rem;
 padding: .65rem .85rem;
 border-inline-start: 2px solid var(--grey-200);
 line-height: 1.6;
}
p {
 margin: 0;
}
p + p {
 margin-block-start: .4rem;
}
</style>
