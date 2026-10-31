<script setup lang="ts">
import {computed, ref} from 'vue'
import {useConfigStore} from '@/stores/config'
import BaseButton from '@/components/base/BaseButton.vue'

const configStore = useConfigStore()
const hide = ref(false)
const enabled = computed(() => configStore.demo_mode_enabled && !hide.value)
</script>

<template>
	<div
		v-if="enabled"
		class="demo-mode-banner d-print-none"
		role="status"
	>
		<p>
			{{ $t('demo.title') }}
			<strong class="is-uppercase">{{ $t('demo.everythingWillBeDeleted') }}</strong>
		</p>
		<BaseButton
			:aria-label="$t('misc.closeBanner')"
			class="hide-button"
			@click="() => hide = true"
		>
			<Icon icon="times" />
		</BaseButton>
	</div>
</template>

<style scoped lang="scss">
// A full-width warning strip that stops short of the bottom-end dock.
.demo-mode-banner {
	position: fixed;
	inset-block-end: 0;
	inset-inline: 0 var(--dock-reserve-inline);
	z-index: var(--layer-floating);
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--space-2);
	min-block-size: var(--nav-row-height);
	padding: var(--space-1) var(--space-2) calc(var(--space-1) + env(safe-area-inset-bottom, 0px)) var(--space-4);
	border-start-end-radius: var(--radius-md);
	// Deep red with white text keeps 4.5:1 in both colour schemes.
	background: hsl(var(--danger-h), var(--danger-s), 38%);
	color: var(--text-on-accent);
	font-size: var(--text-sm);
	text-align: center;

	strong {
		color: inherit;
	}
}

.hide-button {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	inline-size: var(--nav-row-height);
	block-size: var(--nav-row-height);
	border-radius: $radius;
	color: inherit;
	cursor: pointer;

	&:hover {
		background: hsla(0, 0%, 100%, .14);
	}
}
</style>
