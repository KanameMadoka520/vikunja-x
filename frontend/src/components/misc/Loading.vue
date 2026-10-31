<template>
	<div
		class="loader-container is-loading"
		:class="{'is-small': variant === 'small'}"
		role="status"
	>
		<span class="is-sr-only">{{ $t('misc.loading') }}</span>
	</div>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
	variant?: 'default' | 'small'
}>(), {
	variant: 'default',
})
</script>

<style scoped lang="scss">
// Fills its container; the minimum only has to hold the spinner, so phones never overflow.
.loader-container {
	block-size: 100%;
	min-block-size: 200px;
	inline-size: 100%;
	min-inline-size: 5rem;

	&.is-loading-small {
		min-block-size: 50px;
		min-inline-size: 100px;
	}

	&.is-small {
		block-size: 150px;
		min-block-size: 0;
	}
}
</style>
