import type {IconProp} from '@fortawesome/fontawesome-svg-core'

export type GuideId = 'basics' | 'ai' | 'showcase'

export interface GuideStep {
	id: string
	target: string
	route?: string
	sidebar?: boolean
}

export const guides: Record<GuideId, {
	icon: IconProp
	steps: GuideStep[]
}> = {
	basics: {
		icon: 'compass',
		steps: [
			{
				id: 'overview',
				target: 'nav-overview',
				route: 'home',
				sidebar: true,
			},
			{
				id: 'projects',
				target: 'nav-projects',
				sidebar: true,
			},
			{
				id: 'addTask',
				target: 'home-add',
			},
			{
				id: 'upcoming',
				target: 'nav-upcoming',
				sidebar: true,
			},
			{
				id: 'teams',
				target: 'nav-teams',
				sidebar: true,
			},
			{
				id: 'search',
				target: 'quick-search',
			},
			{
				id: 'assistant',
				target: 'nav-ai',
				sidebar: true,
			},
			{
				id: 'settings',
				target: 'account-menu',
			},
			{
				id: 'replay',
				target: 'guide-help',
			},
		],
	},
	ai: {
		icon: 'robot',
		steps: [
			{
				id: 'connections',
				target: 'ai-connections',
				route: 'user.settings.ai',
			},
			{
				id: 'addConnection',
				target: 'ai-add',
			},
			{
				id: 'roles',
				target: 'ai-roles',
			},
			{
				id: 'saveModels',
				target: 'ai-save',
			},
			{
				id: 'permissions',
				target: 'ai-permissions',
				route: 'tcy-ai',
			},
			{
				id: 'voice',
				target: 'ai-voice',
			},
			{
				id: 'send',
				target: 'ai-prompt',
			},
		],
	},
	showcase: {
		icon: 'globe',
		steps: [
			{
				id: 'publication',
				target: 'showcase-status',
				route: 'user.settings.showcase',
			},
			{
				id: 'hours',
				target: 'showcase-hours',
			},
			{
				id: 'privacy',
				target: 'showcase-projects',
			},
			{
				id: 'customPage',
				target: 'showcase-content',
			},
			{
				id: 'preview',
				target: 'showcase-preview',
			},
			{
				id: 'publish',
				target: 'showcase-publish',
			},
		],
	},
}

// Keep progress separate for each account and API server, including desktop clients.
export function guideStorageKey(apiUrl: string, userId: number): string {
	return `tcymc-guides:v1:${encodeURIComponent(apiUrl)}:${userId}`
}
