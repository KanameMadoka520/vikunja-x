<template>
	<div class="datepicker">
		<Popup
			v-model:open="show"
			placement="bottom-start"
			:anchor="triggerEl"
			sheet-on-mobile
			:sheet-title="dialogTitle"
			surface
		>
			<template #trigger="{toggle}">
				<SimpleButton
					ref="triggerButton"
					v-tooltip="date ? formatDateLong(date) : undefined"
					class="show"
					:disabled="disabled || undefined"
					@click.stop="toggle()"
				>
					<i v-if="date === null && emptyLabel !== ''">{{ emptyLabel }}</i>
					<template v-else>
						{{ date === null ? chooseDateLabel : formatDisplayDate(date) }}
					</template>
				</SimpleButton>
			</template>
			<template #header-action>
				<BaseButton
					class="datepicker-popup__clear"
					@click.stop="clear"
				>
					{{ $t('input.datepicker.clear') }}
				</BaseButton>
			</template>
			<template #content="{isOpen}">
				<div
					v-if="isOpen"
					class="datepicker-popup"
					:class="{'datepicker-popup--no-shortcuts': !showShortcuts}"
					:role="isMobile ? undefined : 'dialog'"
					:aria-label="isMobile ? undefined : dialogTitle"
					tabindex="-1"
				>
					<DatepickerInline
						v-model="date"
						:show-shortcuts="showShortcuts"
						:shortcuts-layout="isMobile ? 'chips' : 'sidebar'"
						:large="isMobile"
						:min-date="minDate"
						@update:modelValue="updateData"
						@confirm="close"
					/>

					<div class="datepicker-popup__footer">
						<div class="datepicker-popup__summary">
							<Icon
								:icon="['far', 'calendar-check']"
								class="datepicker-popup__summary-icon"
							/>
							<span>{{ date === null ? $t('input.datepicker.noDate') : formatDate(date, summaryFormat) }}</span>
						</div>
						<XButton
							v-if="!isMobile"
							variant="secondary"
							:shadow="false"
							@click.stop="clear"
						>
							{{ $t('input.datepicker.clear') }}
						</XButton>
						<XButton
							v-cy="'closeDatepicker'"
							class="datepicker__close-button"
							:shadow="false"
							@click.stop="close"
						>
							{{ $t('misc.confirm') }}
						</XButton>
					</div>
				</div>
			</template>
		</Popup>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, toRef, watch, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'

import BaseButton from '@/components/base/BaseButton.vue'
import Popup from '@/components/misc/Popup.vue'
import DatepickerInline from '@/components/input/DatepickerInline.vue'
import SimpleButton from '@/components/input/SimpleButton.vue'

import {formatDate, formatDateLong, formatDisplayDate} from '@/helpers/time/formatDate'
import {createDateFromString} from '@/helpers/time/createDateFromString'
import {useTimeFormat} from '@/composables/useTimeFormat'
import {TIME_FORMAT} from '@/constants/timeFormat'
import {useIsMobile} from '@/composables/useIsMobile'

const props = withDefaults(defineProps<{
	modelValue: Date | null | string,
	chooseDateLabel?: string,
	title?: string,
	disabled?: boolean,
	showShortcuts?: boolean,
	// When the value is null, show this (italic) instead of chooseDateLabel.
	emptyLabel?: string,
	minDate?: Date | null,
}>(), {
	chooseDateLabel: () => {
		const {t} = useI18n({useScope: 'global'})
		return t('input.datepicker.chooseDate')
	},
	title: '',
	disabled: false,
	showShortcuts: true,
	emptyLabel: '',
	minDate: null,
})

const emit = defineEmits<{
	'update:modelValue': [value: Date | null],
	'close': [value: boolean],
	'closeOnChange': [value: boolean],
}>()

const isMobile = useIsMobile()

const dialogTitle = computed(() => props.title || props.chooseDateLabel)

const {store: timeFormat} = useTimeFormat()
const summaryFormat = computed(() => timeFormat.value === TIME_FORMAT.HOURS_24 ? 'ddd, ll HH:mm' : 'ddd, ll hh:mm A')

const date = ref<Date | null>(null)
const show = ref(false)
const changed = ref(false)

const modelValue = toRef(props, 'modelValue')
watch(
	modelValue,
	setDateValue,
	{immediate: true},
)

function setDateValue(dateString: string | Date | null) {
	if (dateString === null) {
		date.value = null
		return
	}
	date.value = createDateFromString(dateString)
}

function updateData() {
	changed.value = true
	emit('update:modelValue', date.value ?? null)
}

function clear() {
	date.value = null
	updateData()
}

const triggerButton = ref<InstanceType<typeof SimpleButton> | null>(null)
const triggerEl = computed<HTMLElement | null>(() => triggerButton.value?.$el ?? null)

watch(show, async (isOpen) => {
	if (!isOpen) {
		emitClose()
		return
	}
	await nextTick()
	if (!isMobile.value) {
		triggerButton.value?.focus()
	}
})

function close() {
	show.value = false
}

function open() {
	if (!props.disabled) {
		show.value = true
	}
}

function emitClose() {
	emit('close', changed.value)
	if (changed.value) {
		changed.value = false
		emit('closeOnChange', changed.value)
	}
}

defineExpose({
	open,
})
</script>

<style lang="scss" scoped>
// The surface is painted by <Popup surface>; inside the mobile sheet the sheet panel is the surface.
.datepicker-popup {
	position: relative;
	inline-size: 548px;
	max-inline-size: calc(100vw - 2rem);

	&--no-shortcuts {
		inline-size: 380px;
	}

	.bottom-sheet & {
		inline-size: 100%;
		max-inline-size: none;
	}
}

.datepicker-popup__clear {
	min-block-size: var(--target-min);
	padding-inline: var(--space-2);
	border-radius: var(--radius-sm);
	color: var(--accent-text);
	font-size: var(--text-md);
	font-weight: var(--weight-semibold);

	&:hover {
		background-color: var(--surface-hover);
	}
}

.datepicker-popup__footer {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	padding: var(--space-3) var(--space-4);
	border-block-start: 1px solid var(--border-subtle);
	background: var(--surface-sunken);

	.bottom-sheet & {
		flex-direction: column;
		align-items: stretch;
		padding-block-end: var(--space-4);
		background: transparent;
	}
}

.datepicker-popup__summary {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	flex: 1;
	min-inline-size: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: var(--text-sm);
	font-weight: var(--weight-semibold);
	color: var(--text-secondary);
	font-variant-numeric: tabular-nums;
}

.datepicker-popup__summary-icon {
	color: var(--primary);
}

// The sheet is the touch layout, so its confirm button gets the full touch target.
.datepicker__close-button {
	.bottom-sheet & {
		min-block-size: 2.75rem;
	}
}
</style>
