<template>
	<td
		v-tooltip="!dateIsValid(date) ? '' : formatDateLong(date)"
		class="date-table-cell"
		:class="{'is-empty': !dateIsValid(date)}"
	>
		<time :datetime="date ? formatISO(date) : undefined">
			{{ !dateIsValid(date) ? '-' : formatDisplayDate(date) }}
		</time>
	</td>
</template>

<script setup lang="ts">
import {dateIsValid, formatISO, formatDateLong, formatDisplayDate} from '@/helpers/time/formatDate'

withDefaults(defineProps<{
	date?: Date | string
}>(), {
	date: '',
})
</script>

<style lang="scss" scoped>
.date-table-cell {
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	&.is-empty {
		color: var(--text-tertiary);
	}
}
</style>
