<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {Task} from '@/client/generated'
import BaseButton from '@/components/base/BaseButton.vue'
const props = withDefaults(defineProps<{task: Task; inlineTree?: boolean; expanded?: boolean}>(), {inlineTree: false, expanded: true})
defineEmits<{toggle: []}>()
const {t} = useI18n({useScope: 'global'})
function unique(tasks: Task[]) { return [...new Map(tasks.filter(task => task.id !== undefined && task.id !== props.task.id).map(task => [task.id, task])).values()] }
const parents = computed(() => unique(props.task.related_tasks?.parenttask ?? []))
const children = computed(() => unique(props.task.related_tasks?.subtask ?? []))
const label = computed(() => t('task.hierarchy.children', {done: children.value.filter(child => child.done).length, total: children.value.length}))
</script>

<template>
	<div
		v-if="parents.length || children.length"
		class="task-hierarchy-summary"
		@click.stop
		@keydown.stop
		@keyup.stop
	>
		<RouterLink
			v-for="parent in parents"
			:key="parent.id"
			class="parent-task-link"
			:to="{name: 'task.detail', params: {id: parent.id}}"
			:title="t('task.hierarchy.parent', {title: parent.title})"
		>
			<Icon icon="level-up-alt" />{{ t('task.hierarchy.parent', {title: parent.title}) }}
		</RouterLink>
		<BaseButton
			v-if="children.length && inlineTree"
			class="subtasks-toggle"
			:aria-expanded="expanded"
			:aria-label="t(expanded ? 'task.hierarchy.collapse' : 'task.hierarchy.expand', {title: task.title})"
			:title="t('task.hierarchy.directOnly')"
			@click="$emit('toggle')"
		>
			<Icon :icon="expanded ? 'chevron-down' : 'chevron-right'" />{{ label }}
		</BaseButton>
		<details
			v-else-if="children.length"
			class="subtasks-preview"
		>
			<summary :title="t('task.hierarchy.directOnly')">
				<Icon icon="sitemap" />{{ label }}
			</summary>
			<ul>
				<li
					v-for="child in children"
					:key="child.id"
				>
					<Icon
						:icon="child.done ? 'check' : 'minus'"
						:aria-label="t(child.done ? 'task.hierarchy.done' : 'task.hierarchy.pending')"
					/>
					<RouterLink
						:to="{name: 'task.detail', params: {id: child.id}}"
						:class="{'child-done': child.done}"
					>
						{{ child.title }}
					</RouterLink>
				</li>
			</ul>
		</details>
	</div>
</template>

<style scoped lang="scss">
.task-hierarchy-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	gap: .35rem .6rem;
	font-size: .78rem;
	font-weight: 400;
	line-height: 1.5;
	margin-block: .3rem;
	min-inline-size: 0;
}
.parent-task-link, .subtasks-toggle, .subtasks-preview summary {
	display: inline-flex;
	align-items: center;
	gap: .35rem;
	padding: .2rem .45rem;
	border-radius: .45rem;
	background: var(--grey-100);
	color: var(--text);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
	cursor: pointer;
}
.parent-task-link svg, .subtasks-toggle svg { flex-shrink: 0; }
.subtasks-preview { max-inline-size: 100%; }
.subtasks-preview ul {
	margin: .4rem 0 0 .5rem;
	padding-inline-start: .75rem;
	border-inline-start: 2px solid var(--grey-300);
}
.subtasks-preview li {
	display: flex;
	gap: .4rem;
	align-items: baseline;
	margin-block: .3rem;
}
.subtasks-preview a { overflow-wrap: anywhere; }
.child-done {
	text-decoration: line-through;
	opacity: .7;
}
</style>
