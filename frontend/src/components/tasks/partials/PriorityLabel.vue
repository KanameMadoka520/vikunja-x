<template>
	<span
		v-if="!done && (showAll || priority >= minimumPriority)"
		:class="{
			'negligible': priority <= priorities.LOW,
			'not-so-high': priority > priorities.LOW && priority < priorities.HIGH,
			'high-priority': priority >= priorities.HIGH
		}"
		class="priority-label"
	>
		<span
			class="icon priority-label__icon"
			aria-hidden="true"
		>
			<Icon
				v-if="priority >= priorities.HIGH"
				icon="exclamation-circle"
			/>
			<Icon
				v-else
				icon="exclamation"
			/>
		</span>
		<span class="priority-label__text">
			<template v-if="priority === priorities.UNSET">{{ $t('task.priority.unset') }}</template>
			<template v-if="priority === priorities.LOW">{{ $t('task.priority.low') }}</template>
			<template v-if="priority === priorities.MEDIUM">{{ $t('task.priority.medium') }}</template>
			<template v-if="priority === priorities.HIGH">{{ $t('task.priority.high') }}</template>
			<template v-if="priority === priorities.URGENT">{{ $t('task.priority.urgent') }}</template>
			<template v-if="priority === priorities.DO_NOW">{{ $t('task.priority.doNow') }}</template>
		</span>
	</span>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {PRIORITIES as priorities} from '@/constants/priorities'
import {useAuthStore} from '@/stores/auth'

withDefaults(defineProps<{
	priority: number,
	showAll?: boolean,
	done?: boolean
}>(), {
	showAll: false,
	done: false,
})

const authStore = useAuthStore()

const minimumPriority = computed(() => {
	return authStore.settings.frontend_settings.minimum_priority || priorities.MEDIUM
})
</script>

<style lang="scss" scoped>
.priority-label {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	font-weight: var(--weight-medium);
	white-space: nowrap;
}

.high-priority {
	color: var(--danger-text);
}

// --warning as text is ~2.3:1 on white; mixing in the primary text colour keeps the hue
// and clears 4.5:1 in light mode while staying bright in dark mode. Surfaces with their own
// colour (e.g. coloured kanban cards) can override the custom properties.
.not-so-high {
	color: var(--priority-medium-color, color-mix(in srgb, var(--warning) 60%, var(--text-primary)));
}

.negligible {
	color: var(--priority-low-color, var(--text-secondary));
}

.priority-label__icon {
	inline-size: auto;
	block-size: auto;
}
</style>
