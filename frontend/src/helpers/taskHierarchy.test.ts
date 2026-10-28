import {describe, expect, it} from 'vitest'
import {buildTaskHierarchy} from './taskHierarchy'
import type {Task} from '@/client/generated'

function renderedIds(tasks: Task[]) {
	const forest = buildTaskHierarchy(tasks)
	const visit = (task: Task): number[] => [task.id!, ...(forest.children.get(task.id!) ?? []).flatMap(visit)]
	return forest.roots.flatMap(visit)
}
describe('task display hierarchy', () => {
	it('renders a shared child once without changing either parent relation', () => {
		const tasks: Task[] = [{id: 1, related_tasks: {subtask: [{id: 3}]}}, {id: 2, related_tasks: {subtask: [{id: 3}]}}, {id: 3, related_tasks: {parenttask: [{id: 2}, {id: 1}]}}]
		expect(renderedIds(tasks)).toEqual([1, 3, 2])
		expect(tasks[2].related_tasks?.parenttask).toHaveLength(2)
		expect(buildTaskHierarchy([...tasks].reverse()).children.get(1)?.map(task => task.id)).toEqual([3])
	})
	it('breaks cycles only for display so every task remains reachable', () => {
		const tasks: Task[] = [{id: 1, related_tasks: {parenttask: [{id: 3}]}}, {id: 2, related_tasks: {parenttask: [{id: 1}]}}, {id: 3, related_tasks: {parenttask: [{id: 2}]}}]
		expect(renderedIds(tasks).sort()).toEqual([1, 2, 3])
	})
	it('ignores self relations, missing parents and ordinary links when nesting', () => {
		expect(renderedIds([{id: 1, related_tasks: {parenttask: [{id: 1}, {id: 99}], related: [{id: 2}]}}, {id: 2}])).toEqual([1, 2])
	})
	it('preserves current view ordering and never inserts tasks from relation headers', () => {
		const forest = buildTaskHierarchy([{id: 1, related_tasks: {subtask: [{id: 2}, {id: 3}, {id: 4}]}}, {id: 3}, {id: 2}])
		expect(forest.children.get(1)?.map(task => task.id)).toEqual([3, 2])
	})
})
