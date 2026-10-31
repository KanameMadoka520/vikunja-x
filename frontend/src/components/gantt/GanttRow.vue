<template>
	<GanttRowPrimitive
		:id="id"
		@focus="onFocus"
		@select="onSelect"
	>
		<div
			class="gantt-row-inner"
			:class="{'is-alt': index % 2}"
			role="presentation"
		>
			<slot />
		</div>
	</GanttRowPrimitive>
</template>

<script setup lang="ts">
import GanttRowPrimitive from '@/components/gantt/primitives/GanttRowPrimitive.vue'

const props = defineProps<{ 
	id: string
	index: number 
}>()
const emit = defineEmits<{
  (e: 'focus', id: string): void
  (e: 'select', id: string): void
}>()
const onFocus = () => emit('focus', props.id)
const onSelect = () => emit('select', props.id)
</script>

<style scoped>
/* Translucent stripes, so weekend shading and the today line underneath stay visible. */
.gantt-row-inner.is-alt {
	background: var(--surface-hover);
}
</style>
