<template>
	<transition :name="name">
		<!-- eslint-disable-next-line -->
		<slot/>
	</transition>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
	name?: 'fade' | 'flash-background' | 'width'
}>(), {
	name: 'fade',
})
</script>

<style scoped lang="scss">
// fade and width live in styles/transitions.scss so plain <Transition> users share them.
.flash-background-enter-from,
.flash-background-enter-active {
	animation: flash-background 750ms var(--ease-standard) 1;
}

@keyframes flash-background {
	0% {
		background: var(--surface-selected-strong);
	}

	100% {
		background: transparent;
	}
}

// A colour flash is not motion, but the highlight should not linger for users who asked for less animation.
@media (prefers-reduced-motion: reduce) {
	.flash-background-enter-from,
	.flash-background-enter-active {
		animation: none;
	}
}
</style>
