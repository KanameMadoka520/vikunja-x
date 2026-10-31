<script setup lang="ts">
import portrait from '@/assets/arona/arona.png'

withDefaults(defineProps<{size?: 'small' | 'normal' | 'large'}>(), {size: 'normal'})
</script>

<template>
	<img
		:src="portrait"
		alt=""
		class="arona-avatar"
		:class="`arona-avatar--${size}`"
		width="32"
		height="32"
		draggable="false"
	>
</template>

<style scoped lang="scss">
.arona-avatar {
	display: inline-block;
	flex-shrink: 0;
	inline-size: 2rem;
	block-size: 2rem;
	border-radius: 50%;
	background: var(--surface-selected);
	object-fit: cover;
	object-position: center 20%;
	vertical-align: middle;

	&--small {
		inline-size: 1.5rem;
		block-size: 1.5rem;
	}

	&--large {
		inline-size: 4.5rem;
		block-size: 4.5rem;
		margin-block-end: var(--space-5);
	}
}
</style>
