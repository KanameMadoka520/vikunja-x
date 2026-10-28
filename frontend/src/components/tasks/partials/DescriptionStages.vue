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
 progress {
inline-size: 100%;
block-size: .5rem;
accent-color: var(--primary);
}
 details {
border: 1px solid var(--grey-200);
border-radius: .65rem;
margin-block: .75rem;
}
 summary {
padding: .8rem;
cursor: pointer;
overflow-wrap: anywhere;
}
 summary small {
float: inline-end;
margin-inline-start: .5rem;
color: var(--text-light);
}
}
.stage-help {
color: var(--text-light);
font-size: .85rem;
}
.stage-item {
 display: flex;
align-items: flex-start;
gap: .75rem;
padding: .6rem .8rem;
 margin-inline-start: calc(var(--stage-depth) * .75rem);
 input {
margin-block-start: .3rem;
inline-size: 1.1rem;
block-size: 1.1rem;
flex-shrink: 0;
accent-color: var(--primary);
cursor: pointer;
}
 &.checked .stage-item-content {
color: var(--text-light);
}
}
.stage-item-content {
min-inline-size: 0;
overflow-wrap: anywhere;
:deep(p) {
margin: 0;
} :deep(img) {
max-inline-size: 100%;
}
}
@media print {
.description-stages {
display: none;
}
}
</style>
