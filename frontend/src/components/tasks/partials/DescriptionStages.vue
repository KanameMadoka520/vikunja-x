<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {descriptionStages, setDescriptionCheckbox} from '@/helpers/descriptionStages'
const props = defineProps<{modelValue: string, canWrite: boolean, saving: boolean}>()
const emit = defineEmits<{'update:modelValue': [html: string]}>()
const {t} = useI18n({useScope: 'global'})
const groups = computed(() => descriptionStages(props.modelValue))
const total = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))
const checked = computed(() => groups.value.reduce((n, g) => n + g.checked, 0))
function toggle(index: number, event: Event) {
	if (!props.canWrite || props.saving) return
	emit('update:modelValue', setDescriptionCheckbox(props.modelValue, index, (event.target as HTMLInputElement).checked))
}
</script>

<template>
	<section
		class="description-stages"
		:aria-label="t('stages.title')"
	>
		<p>{{ t('stages.progress', {done: checked, total}) }}</p>
		<progress
			:value="checked"
			:max="total || 1"
			:aria-label="t('stages.progress', {done: checked, total})"
		/>
		<p class="stage-help">
			{{ t('stages.help') }}
		</p>
		<details
			v-for="(group, index) in groups"
			:key="index"
			:open="groups.length === 1 && total <= 12"
		>
			<summary><span>{{ group.title || t('stages.ungrouped') }}</span><small>{{ group.checked }} / {{ group.items.length }}</small></summary>
			<div
				v-for="item in group.items"
				:key="item.index"
				class="stage-item"
				:class="{checked: item.checked}"
				:style="{'--stage-depth': Math.min(item.depth, 3)}"
			>
				<input
					type="checkbox"
					:checked="item.checked"
					:disabled="!canWrite || saving"
					:aria-label="t('stages.toggle', {number: item.index + 1})"
					@change="toggle(item.index, $event)"
				>
				<div
					class="stage-item-content"
					v-html="item.html"
				/>
			</div>
		</details>
	</section>
</template>

<style scoped lang="scss">
.description-stages {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);

	> p {
		margin: 0;
		color: var(--text-primary);
		font-size: var(--text-md);
		font-weight: var(--weight-medium);
	}

	progress {
		inline-size: 100%;
		block-size: .375rem;
		accent-color: var(--primary);
	}

	details {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-block-size: max(2.25rem, var(--target-min));
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-weight: var(--weight-semibold);
		overflow-wrap: anywhere;
		cursor: pointer;

		&:hover {
			background: var(--surface-hover);
		}

		&:focus-visible {
			@include focus-ring;
		}
	}

	summary small {
		flex-shrink: 0;
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		font-weight: var(--weight-regular);
		font-variant-numeric: tabular-nums;
	}
}

.description-stages > .stage-help {
	color: var(--text-tertiary);
	font-size: var(--text-sm);
	font-weight: var(--weight-regular);
}

.stage-item {
	display: flex;
	align-items: flex-start;
	gap: var(--space-3);
	padding: var(--space-2) var(--space-3);
	margin-inline-start: calc(var(--stage-depth) * var(--space-3));
	border-block-start: 1px solid var(--border-subtle);

	input {
		flex-shrink: 0;
		inline-size: 1rem;
		block-size: 1rem;
		margin-block-start: .2rem;
		accent-color: var(--primary);
		cursor: pointer;
	}

	&.checked .stage-item-content {
		color: var(--text-tertiary);
	}
}

.stage-item-content {
	min-inline-size: 0;
	overflow-wrap: anywhere;

	:deep(p) {
		margin: 0;
	}

	:deep(img) {
		max-inline-size: 100%;
	}
}

@media print {
	.description-stages {
		display: none;
	}
}
</style>
