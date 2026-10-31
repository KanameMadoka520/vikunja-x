<template>
	<div
		class="message-wrapper"
		:role="variant === 'danger' ? 'alert' : undefined"
	>
		<div
			class="message"
			:class="[variant, textAlignClass]"
		>
			<slot />
		</div>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

const props = withDefaults(defineProps<{
	variant?: 'info' | 'danger' | 'warning' | 'success',
	textAlign?: TextAlignVariant
}>(), {
	variant: 'info',
	textAlign: 'left',
})

const TEXT_ALIGN_MAP = {
	left: '',
	center: 'has-text-centered',
	right: 'has-text-end',
} as const

export type TextAlignVariant = keyof typeof TEXT_ALIGN_MAP

const textAlignClass = computed(() => TEXT_ALIGN_MAP[props.textAlign])
</script>

<style lang="scss" scoped>
.message-wrapper {
	border-radius: var(--radius-md);
	background: var(--surface);
}

// A coloured leading rule and a faint tint; the text keeps the normal colour for contrast.
.message {
	padding: .65rem .9rem;
	border-radius: var(--radius-md);
	border: 1px solid var(--border-subtle);
	border-inline-start-width: 3px;
	font-size: var(--text-md);
	color: var(--text-primary);
}

.info {
	border-inline-start-color: var(--primary);
	background: var(--tint-info);
}

.danger {
	border-inline-start-color: var(--danger);
	background: var(--tint-danger);
}

.warning {
	border-inline-start-color: var(--warning);
	background: var(--tint-warning);
}

.success {
	border-inline-start-color: var(--success);
	background: var(--tint-success);
}
</style>
