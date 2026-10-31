import {computed, watch} from 'vue'
import {useQuery, useQueryClient} from '@tanstack/vue-query'
import {useConversationEvents} from '@/client/queries/conversationEvents'
import {
	agentRunScope,
	conversationQuery,
	endAgentRun,
	resumeAgentRun,
	useApplyAgentReceipts,
} from '@/client/queries/tcyConversations'
import {useAuthStore} from '@/stores/auth'

/**
 * Keeps applying the receipts of the account's running Arona conversation while no assistant view shows it,
 * e.g. after starting a run on /ai and moving to a project without opening the floating panel. It follows
 * only that one conversation (the server runs one job per account) and shares the receipt ledger with the
 * views, so a receipt applies once whoever sees it first.
 */
export function useAronaRunObserver() {
	const client = useQueryClient()
	const auth = useAuthStore()
	const scope = agentRunScope(client)
	resumeAgentRun(client)
	// Another account never follows the previous one's run.
	watch(() => auth.info?.id, () => resumeAgentRun(client))

	const following = computed(() => {
		const id = scope.live.value
		return id && !scope.viewers.has(id) ? id : ''
	})
	const events = useConversationEvents(following)
	const conversation = useQuery(computed(() => conversationQuery(following.value, events.connected.value)))
	const apply = useApplyAgentReceipts()
	watch(conversation.data, value => {
		if (following.value && value?.id === following.value) apply(value)
	}, {immediate: true})
	// A conversation the account can no longer read (deleted meanwhile) has no run left to follow.
	watch(conversation.error, error => {
		const status = (error as {status?: number} | null)?.status
		if ((status === 403 || status === 404) && following.value) endAgentRun(client, following.value)
	})
	return {following}
}
