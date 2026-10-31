<template>
	<form
		class="add-new-task"
		@submit.prevent="createTask"
	>
		<CustomTransition name="fade">
			<input
				v-if="newTaskFieldActive"
				ref="newTaskTitleField"
				v-model="newTaskTitle"
				class="input"
				type="text"
				@blur="hideCreateNewTask"
				@keyup.esc="newTaskFieldActive = false"
			>
		</CustomTransition>
		<XButton
			:shadow="false"
			icon="plus"
			@click="showCreateTaskOrCreate"
		>
			{{ $t('task.new') }}
		</XButton>
	</form>
</template>

<script setup lang="ts">
import {nextTick, ref} from 'vue'
import type {Task as ITask} from '@/client/generated'

import CustomTransition from '@/components/misc/CustomTransition.vue'

const emit = defineEmits<{
	(e: 'createTask', title: string): Promise<ITask>
}>()

const newTaskFieldActive = ref(false)
const newTaskTitleField = ref()
const newTaskTitle = ref('')

function showCreateTaskOrCreate() {
	if (!newTaskFieldActive.value) {
		// Timeout to not send the form if the field isn't even shown
		setTimeout(() => {
			newTaskFieldActive.value = true
			nextTick(() => newTaskTitleField.value.focus())
		}, 100)
	} else {
		createTask()
	}
}

function hideCreateNewTask() {
	if (newTaskTitle.value === '') {
		nextTick(() => (newTaskFieldActive.value = false))
	}
}

async function createTask() {
	if (!newTaskFieldActive.value) {
		return
	}
	await emit('createTask', newTaskTitle.value)
	newTaskTitle.value = ''
	hideCreateNewTask()
}
</script>

<style scoped lang="scss">
.add-new-task {
	display: flex;
	gap: var(--space-2);
	max-inline-size: 450px;
	padding: var(--space-4) var(--space-3) var(--space-2);

	.input {
		font-size: var(--text-sm);
	}

	.button {
		flex-shrink: 0;
		font-size: var(--text-sm);
	}
}
</style>
