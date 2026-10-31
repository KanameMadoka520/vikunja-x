<template>
	<div class="password-field">
		<input
			id="password"
			class="input"
			name="password"
			:placeholder="$t('user.auth.passwordPlaceholder')"
			required
			:type="passwordFieldType"
			:autocomplete="autocomplete"
			:aria-invalid="isValid !== true ? true : undefined"
			:aria-describedby="errorId"
			@keyup.enter="e => $emit('submit', e)"
			@focusout="() => {validate(); validateAfterFirst = true}"
			@keyup="() => {validateAfterFirst ? validate() : null}"
			@input="handleInput"
		>
		<BaseButton
			v-tooltip="passwordFieldType === 'password' ? $t('user.auth.showPassword') : $t('user.auth.hidePassword')"
			class="password-field-type-toggle"
			:aria-label="passwordFieldType === 'password' ? $t('user.auth.showPassword') : $t('user.auth.hidePassword')"
			@click="togglePasswordFieldType"
		>
			<Icon :icon="passwordFieldType === 'password' ? 'eye' : 'eye-slash'" />
		</BaseButton>
	</div>
	<p
		v-if="isValid !== true"
		:id="errorId"
		class="help is-danger"
		role="alert"
	>
		{{ isValid }}
	</p>
</template>

<script lang="ts" setup>
import {computed, ref, watchEffect} from 'vue'
import {useDebounceFn} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import BaseButton from '@/components/base/BaseButton.vue'
import {validatePassword} from '@/helpers/validatePasswort'

const props = withDefaults(defineProps<{
	modelValue?: string,
	// This prop is a workaround to trigger validation from the outside when the user never had focus in the input.
	validateInitially?: boolean,
	validateMinLength?: boolean,
	autocomplete?: string,
}>(), {
	modelValue: '',
	validateMinLength: true,
	autocomplete: 'current-password',
})

const emit = defineEmits<{
	'update:modelValue': [value: string],
	'submit': [event: Event],
}>()
const {t} = useI18n()
const passwordFieldType = ref('password')
const password = ref('')
// Valid until the first validation runs, so the field does not announce an error before any input.
const isValid = ref<true | string>(true)
const validateAfterFirst = ref(false)
const errorId = computed(() => isValid.value !== true ? 'password-error' : undefined)

const validate = useDebounceFn(() => {
	const valid = validatePassword(password.value, props.validateMinLength)
	isValid.value = valid === true ? true : t(valid)
}, 100)

watchEffect(() => props.validateInitially && validate())

function togglePasswordFieldType() {
	passwordFieldType.value = passwordFieldType.value === 'password'
		? 'text'
		: 'password'
}

function handleInput(e: Event) {
	password.value = (e.target as HTMLInputElement)?.value
	emit('update:modelValue', password.value)
}
</script>

<style lang="scss" scoped>
.password-field {
	position: relative;

	.input {
		padding-inline-end: 2.75rem;
	}
}

.password-field-type-toggle {
	position: absolute;
	inset-block-start: 50%;
	inset-inline-end: var(--space-1);
	display: grid;
	place-items: center;
	min-inline-size: 2rem;
	min-block-size: 2rem;
	border-radius: var(--radius-sm);
	color: var(--text-secondary);
	transform: translateY(-50%);

	&:hover {
		background-color: var(--surface-hover);
		color: var(--text-primary);
	}
}
</style>
