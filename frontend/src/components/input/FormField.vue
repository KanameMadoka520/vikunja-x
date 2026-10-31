<script setup lang="ts">
import {computed, useSlots, useId, ref, useAttrs} from 'vue'
import {useDelayedLoading} from '@/composables/useDelayedLoading'

interface Props {
	modelValue?: string | number
	label?: string
	error?: string | null
	id?: string
	disabled?: boolean
	loading?: boolean
	layout?: 'stacked' | 'two-col'
}

const props = withDefaults(defineProps<Props>(), {
	layout: 'stacked',
})
const emit = defineEmits<{
	'update:modelValue': [value: string | number]
}>()
const showLoading = useDelayedLoading(() => props.loading)

function handleInput(event: Event) {
	const value = (event.target as HTMLInputElement).value
	if (typeof props.modelValue === 'number') {
		emit('update:modelValue', value === '' ? '' : Number(value))
	} else {
		emit('update:modelValue', value)
	}
}

defineOptions({
	inheritAttrs: false,
})

const slots = useSlots()
const generatedId = useId()

const inputId = computed(() => props.id ?? generatedId)
const errorId = computed(() => props.error ? `${inputId.value}-error` : undefined)
const attrs = useAttrs()
const describedBy = computed(() => [attrs['aria-describedby'], errorId.value].filter(Boolean).join(' ') || undefined)
const hasAddon = computed(() => !!slots.addon)

const fieldClasses = computed(() => [
	'field',
	{'has-addons': hasAddon.value},
])

const controlClasses = computed(() => [
	'control',
	{'is-expanded': hasAddon.value},
])

const inputClasses = computed(() => [
	'input',
	{
		'disabled': props.disabled,
		'is-loading': showLoading.value,
	},
])

const inputBindings = computed(() => {
	const bindings: Record<string, unknown> = {}
	if (props.modelValue !== undefined) {
		bindings.value = props.modelValue
	}
	return bindings
})

const inputRef = ref<HTMLInputElement | null>(null)
defineExpose({
	get value() {
		return inputRef.value?.value ?? ''
	},
	focus() {
		inputRef.value?.focus()
	},
})
</script>

<template>
	<div :class="fieldClasses">
		<template v-if="layout === 'two-col'">
			<label
				v-if="label"
				class="two-col"
			>
				<span>{{ label }}</span>
				<slot
					:id="inputId"
					:error-id="errorId"
				>
					<input
						:id="inputId"
						ref="inputRef"
						v-bind="{ ...$attrs, ...inputBindings }"
						:class="inputClasses"
						:disabled="disabled || undefined"
						:aria-invalid="error ? true : undefined"
						:aria-describedby="describedBy"
						@input="handleInput"
					>
				</slot>
			</label>
			<div
				v-if="$slots.addon"
				class="control"
			>
				<slot name="addon" />
			</div>
		</template>
		<template v-else>
			<label
				v-if="label"
				:for="inputId"
				class="label"
			>
				{{ label }}
			</label>
			<div :class="controlClasses">
				<slot
					:id="inputId"
					:error-id="errorId"
				>
					<input
						:id="inputId"
						ref="inputRef"
						v-bind="{ ...$attrs, ...inputBindings }"
						:class="inputClasses"
						:disabled="disabled || undefined"
						:aria-invalid="error ? true : undefined"
						:aria-describedby="describedBy"
						@input="handleInput"
					>
				</slot>
			</div>
			<div
				v-if="$slots.addon"
				class="control"
			>
				<slot name="addon" />
			</div>
		</template>
		<p
			v-if="error"
			:id="errorId"
			class="help is-danger"
			role="alert"
		>
			{{ error }}
		</p>
	</div>
</template>

<style lang="scss" scoped>
// Label and control share the row while each half has room for ~13rem; narrower (phones up to
// ~430px) the control wraps under its label instead of squeezing both.
label.two-col {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--space-1) var(--space-3);
}

label.two-col > span {
	color: var(--text-secondary);
	font-size: var(--text-md);
	font-weight: var(--weight-medium);
}

label.two-col > span,
label.two-col > :deep(input),
label.two-col > :deep(.input),
label.two-col > :deep(.select),
label.two-col > :deep(.timezone-select),
label.two-col > :deep(.multiselect) {
	flex: 1 1 calc(50% - var(--space-3));
	min-inline-size: min(100%, 13rem);
	box-sizing: border-box;
}

// A slotted control's own error message takes a full row under it.
label.two-col > :deep(.help) {
	flex-basis: 100%;
}
</style>
