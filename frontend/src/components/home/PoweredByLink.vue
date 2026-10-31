<template>
	<BaseButton
		class="menu-bottom-link"
		:href="computedUrl"
		target="_blank"
	>
		{{ $t('misc.poweredBy') }}
	</BaseButton>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import {POWERED_BY as poweredByUrl} from '@/urls'

const props = defineProps<{
	utmMedium: string;
}>()

const computedUrl = computed(() => `${poweredByUrl}&utm_medium=${props.utmMedium}`)
</script>

<style lang="scss">
// Unscoped: link shares and the sidebar footer restyle it from their own components.
.menu-bottom-link {
	display: block;
	padding-block: var(--space-4);
	color: var(--text-tertiary);
	font-size: var(--text-xs);
	text-align: center;

	&:hover {
		color: var(--text-primary);
	}
}
</style>
