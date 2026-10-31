<template>
	<!-- Fades in place: height animation would relayout the page every frame (docs/whole-site-design.md). -->
	<transition name="expandable-slide">
		<div
			v-if="initialHeight"
			ref="wrapper"
			class="expandable-initial-height"
			:style="{ maxHeight: open ? undefined : `${initialHeight}px` }"
			:class="{ 'expandable-initial-height--expanded': open }"
		>
			<slot />
		</div>
		<div
			v-else-if="open"
			class="expandable"
		>
			<slot />
		</div>
	</transition>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {getInheritedBackgroundColor} from '@/helpers/getInheritedBackgroundColor'

const props = withDefaults(defineProps<{
  /** Whether the Expandable is open or not */
  open?: boolean,
  /** If there is too much content, content will be cut of here. */
  initialHeight?: number
  /** The hidden content is indicated by a gradient. This is the color that the gradient fades to.
  * Makes only sense if `initialHeight` is set. */
	backgroundColor?: string
}>(), {
	open: false,
	initialHeight: undefined,
	backgroundColor: undefined,
})

const wrapper = ref<HTMLElement | null>(null)

const computedBackgroundColor = computed(() => {
	if (wrapper.value === null) {
		return props.backgroundColor || 'var(--surface)'
	}
	return props.backgroundColor || getInheritedBackgroundColor(wrapper.value)
})
</script>

<style lang="scss" scoped>
.expandable-slide-enter-active,
.expandable-slide-leave-active {
	transition:
		opacity var(--motion-base) var(--ease-standard),
		transform var(--motion-base) var(--ease-standard);
}

.expandable-slide-enter-from,
.expandable-slide-leave-to {
	opacity: 0;
	transform: translateY(-.25rem);
}

.expandable-initial-height {
	padding: 5px;
	margin: -5px;
	overflow: hidden;
	position: relative;

	&::after {
		content: "";
		display: block;
		background-image: linear-gradient(
			to bottom,
			transparent,
			ease-in-out
			v-bind(computedBackgroundColor)
		);
		position: absolute;
		block-size: 40px;
		inline-size: 100%;
		inset-block-end: 0;
	}
}

.expandable-initial-height--expanded {
	&::after {
		display: none;
	}
}
</style>
