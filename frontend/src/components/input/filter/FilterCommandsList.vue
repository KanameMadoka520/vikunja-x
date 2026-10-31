<template>
	<div class="filter-autocompletes">
		<template v-if="items.length">
			<button
				v-for="(item, index) in items"
				:key="`${item.fieldType}-${item.id}`"
				class="filter-autocomplete"
				:class="{ 'is-selected': index === selectedIndex }"
				@click="selectItem(index)"
			>
				<div class="filter-autocomplete__content">
					<XLabel
						v-if="item.fieldType === 'labels'"
						:label="(item.item as unknown as Label)"
						class="filter-autocomplete__label"
					/>
					<User
						v-else-if="item.fieldType === 'users'"
						:user="(item.item as unknown as IUser)"
						:avatar-size="20"
						class="filter-autocomplete__user"
					/>
					<div
						v-else
						class="filter-autocomplete__project"
					>
						{{ item.title }}
					</div>
				</div>
			</button>
		</template>
		<div
			v-else
			class="filter-autocomplete no-results"
		>
			{{ $t('filters.noResults') }}
		</div>
	</div>
</template>

<script setup lang="ts">
import XLabel from '@/components/tasks/partials/Label.vue'
import User from '@/components/misc/User.vue'
import { ref, watch } from 'vue'
import type {Label, User as IUser} from '@/client/generated'
import type { AutocompleteItem } from './FilterAutocomplete'

interface Props {
	items: AutocompleteItem[]
	command: (item: AutocompleteItem) => void
}

const props = defineProps<Props>()

const selectedIndex = ref(0)

watch(
	() => props.items,
	() => {
		selectedIndex.value = 0
	},
)

function onKeyDown({event}: { event: KeyboardEvent }) {
	if (event.key === 'ArrowUp') {
		event.preventDefault()
		event.stopPropagation()
		upHandler()
		return true
	}

	if (event.key === 'ArrowDown') {
		event.preventDefault()
		event.stopPropagation()
		downHandler()
		return true
	}

	if (event.key === 'Enter') {
		if (event.isComposing) {
			return false
		}
		event.preventDefault()
		event.stopPropagation()
		enterHandler()
		return true
	}

	return false
}

function upHandler() {
	selectedIndex.value = ((selectedIndex.value + props.items.length) - 1) % props.items.length
}

function downHandler() {
	selectedIndex.value = (selectedIndex.value + 1) % props.items.length
}

function enterHandler() {
	selectItem(selectedIndex.value)
}

function selectItem(index: number) {
	const item = props.items[index]
	if (item) {
		props.command(item)
	}
}

defineExpose({
	onKeyDown,
})
</script>

<style lang="scss" scoped>
.filter-autocompletes {
	position: relative;
	padding: var(--space-1);
	border-radius: var(--radius-md);
	background-color: var(--surface-raised);
	color: var(--text-primary);
	font-size: var(--text-md);
	box-shadow: var(--elevation-3);
	border: 1px solid var(--border-subtle);
	max-block-size: 12rem;
	overflow-y: auto;
}

.filter-autocomplete {
	display: flex;
	align-items: center;
	margin: 0;
	inline-size: 100%;
	min-block-size: 2rem;
	text-align: start;
	background: transparent;
	color: inherit;
	border-radius: var(--radius-sm);
	border: 0;
	padding: var(--space-1) var(--space-2);
	transition: background-color var(--motion-fast) var(--ease-standard);
	cursor: pointer;

	&.is-selected,
	&:hover {
		background-color: var(--surface-hover);
	}

	&.is-selected {
		background-color: var(--surface-selected);
	}

	&.no-results {
		color: var(--text-tertiary);
		cursor: default;

		&:hover {
			background: transparent;
		}
	}
}

.filter-autocomplete__content {
	display: flex;
	align-items: center;
	inline-size: 100%;
}

.filter-autocomplete__label {
	font-size: var(--text-xs);
}

.filter-autocomplete__user {
	font-size: var(--text-md);
}

.filter-autocomplete__project {
	color: var(--text-primary);
	font-weight: var(--weight-medium);
}
</style>
