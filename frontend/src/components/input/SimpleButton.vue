<template>
	<BaseButton
		ref="baseButton"
		class="simple-button"
	>
		<slot />
	</BaseButton>
</template>

<script lang="ts" setup>
import {ref} from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

const baseButton = ref<InstanceType<typeof BaseButton> | null>(null)

function focus() {
	baseButton.value?.focus()
}

defineExpose({
	focus,
})
</script>

<style lang="scss" scoped>
.simple-button {
	color: var(--text);
	padding: var(--space-1) var(--space-2);
	transition: background-color var(--motion-fast) var(--ease-standard);
	border-radius: $radius;
	display: block;
	margin: 2px 0;
	inline-size: 100%;
	text-align: start;

	&:hover {
		background-color: var(--surface-hover);
	}
}
</style>
