import type {TaskResponse} from '@/client/queries/tasks'
import {buildTaskHierarchy} from '@/helpers/taskHierarchy'

export function shouldShowTaskInListView(task: TaskResponse, allTasksInView: TaskResponse[]): boolean {
	return buildTaskHierarchy(allTasksInView).roots.some(root => root.id === task.id)
}
