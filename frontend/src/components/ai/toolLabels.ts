// Tools whose labels live under agent.tools.<name>.
const AGENT_TOOLS = [
	'list_project_history',
	'list_project_timeline',
	'set_project_completed',
	'update_project',
	'find_tools',
	'ask_user',
	'get_project',
	'list_labels',
	'list_comments',
	'list_project_users',
	'bulk_update_tasks',
	'create_label',
	'add_task_label',
	'remove_task_label',
	'add_comment',
	'assign_task',
	'unassign_task',
	'relate_tasks',
	'unrelate_tasks',
] as const

// Deleting is irreversible; everything else Arona writes can be edited back.
export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set(['delete_task'])

export function toolLabels(t: (key: string) => string): Record<string, string> {
	return {
		web_search: t('webSearch.title'),
		invoke_tool: t('cacheEfficiency.callTool'),
		list_projects: t('tcymc.text.find_projects'),
		list_tasks: t('tcymc.text.find_tasks'),
		get_task: t('tcymc.text.read_task'),
		create_project: t('tcymc.text.create_project'),
		create_task: t('tcymc.text.create_task'),
		update_task: t('tcymc.text.update_task'),
		delete_task: t('tcymc.text.delete_task'),
		...Object.fromEntries(AGENT_TOOLS.map(name => [name, t(`agent.tools.${name}`)])),
	}
}
