<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {refDebounced} from '@vueuse/core'
import {useQuery} from '@tanstack/vue-query'
import {useI18n} from 'vue-i18n'
import {faThumbtack} from '@fortawesome/free-solid-svg-icons'
import {conversationsQuery} from '@/client/queries/tcyConversations'
import type {ConversationSummary} from '@/client/generated'
import ConversationMenu from './ConversationMenu.vue'
defineProps<{selected: string, disabled?: boolean}>()
const emit = defineEmits<{select: [id: string], create: [], close: [], action: [action: string, conversation: ConversationSummary]}>()
const {t} = useI18n({useScope: 'global'})
const search = ref('')
const searchInput = ref<HTMLInputElement>()
const query = refDebounced(search, 250)
const archived = ref(false)
const page = ref(1)
const scope = computed(() => archived.value ? 'archived' : query.value.trim() ? 'all' : 'active')
watch([query, archived], () => { page.value = 1 }, {flush: 'sync'})
const sessions = useQuery(computed(() => conversationsQuery(page.value, query.value.trim(), scope.value)))
watch(() => sessions.data.value?.total_pages, total => { if (total !== undefined && page.value > Math.max(1, total)) page.value = Math.max(1, total) })
const groups = computed(() => {
	const groups: {name: string, items: ConversationSummary[]}[] = []
	const today = new Date(); today.setHours(0, 0, 0, 0)
	const week = new Date(today); week.setDate(week.getDate() - 7)
	for (const item of sessions.data.value?.items ?? []) {
		const time = new Date(item.updated ?? 0).getTime()
		const name = query.value.trim() ? 'results' : item.pinned ? 'pinned' : archived.value ? 'archived' : time >= +today ? 'today' : time >= +week ? 'week' : 'older'
		let group = groups.find(group => group.name === name)
		if (!group) { group = {name, items: []}; groups.push(group) }
		group.items.push(item)
	}
	return groups
})
defineExpose({focusSearch: () => searchInput.value?.focus()})
</script>

<template>
	<div class="history-panel">
		<div class="history-header">
			<strong>{{ t('chat.conversations') }}</strong><button
				type="button"
				:aria-label="t('chatHistory.close')"
				@click="emit('close')"
			>
				<Icon icon="times" />
			</button>
		</div>
		<button
			class="history-new"
			type="button"
			:disabled="disabled"
			@click="emit('create')"
		>
			<Icon icon="plus" />{{ t('chat.new') }}
		</button>
		<label class="history-search"><Icon icon="search" /><input
			ref="searchInput"
			v-model="search"
			type="search"
			:aria-label="t('chatHistory.search')"
			:placeholder="t('chatHistory.search')"
		></label>
		<div class="history-filters">
			<button
				type="button"
				:aria-pressed="!archived"
				@click="archived = false"
			>
				{{ t('chatHistory.recent') }}
			</button><button
				type="button"
				:aria-pressed="archived"
				@click="archived = true"
			>
				<Icon icon="archive" />{{ t('chatHistory.archived') }}
			</button>
		</div>
		<p
			v-if="sessions.isPending.value"
			role="status"
			class="history-empty"
		>
			{{ t('misc.loading') }}
		</p>
		<div
			v-else-if="sessions.isError.value"
			class="history-empty"
		>
			<p>{{ t('chat.loadFailed') }}</p><button @click="sessions.refetch()">
				{{ t('chat.retry') }}
			</button>
		</div>
		<p
			v-else-if="!groups.length"
			role="status"
			class="history-empty"
		>
			{{ t(query.trim() ? 'chatHistory.noResults' : archived ? 'chatHistory.noArchived' : 'chat.noConversations') }}
		</p>
		<section
			v-for="group in groups"
			:key="group.name"
			:aria-label="t(`chatHistory.${group.name}`)"
		>
			<h3>{{ t(`chatHistory.${group.name}`) }}</h3>
			<ul>
				<li
					v-for="session in group.items"
					:key="session.id"
					:class="{'is-selected': session.id === selected}"
					:data-chat-id="session.id"
				>
					<button
						type="button"
						class="history-link"
						:disabled="disabled"
						:aria-current="session.id === selected ? 'true' : undefined"
						:title="session.title || t('chat.untitled')"
						@click="emit('select', session.id!)"
					>
						<span>{{ session.title || t('chat.untitled') }}</span><small v-if="session.running">{{ t('chat.running') }}</small><small v-else-if="session.archived && !archived">{{ t('chatHistory.archived') }}</small>
					</button>
					<Icon
						v-if="session.pinned"
						:icon="faThumbtack"
						class="pin-mark"
						:title="t('chatHistory.pinned')"
					/>
					<ConversationMenu
						:conversation="session"
						:disabled="disabled"
						@action="emit('action', $event, session)"
					/>
				</li>
			</ul>
		</section>
		<div
			v-if="(sessions.data.value?.total_pages ?? 0) > 1"
			class="history-pages"
		>
			<button
				:disabled="page === 1 || sessions.isFetching.value"
				@click="page--"
			>
				{{ t('tour.back') }}
			</button><span>{{ page }} / {{ sessions.data.value?.total_pages }}</span><button
				:disabled="page >= (sessions.data.value?.total_pages ?? 1) || sessions.isFetching.value"
				@click="page++"
			>
				{{ t('tour.next') }}
			</button>
		</div>
		<p class="history-note">
			{{ t('chatHistory.archiveHint') }}
		</p>
	</div>
</template>

<style scoped lang="scss">
.history-panel { min-inline-size: 0;
}
.history-header { display: flex;
align-items: center;
justify-content: space-between;
margin-block-end: .6rem;
font-size: .9rem;
}
.history-header button { display: inline-flex;
align-items: center;
justify-content: center;
inline-size: 36px;
block-size: 40px;
border-radius: .6rem;
}
button { color: var(--text);
background: transparent;
border: 0;
cursor: pointer;
font: inherit;
}
button:disabled { opacity: .5;
cursor: not-allowed;
}
.history-new { display: flex;
align-items: center;
gap: .65rem;
inline-size: 100%;
min-block-size: 40px;
padding: .7rem;
text-align: start;
border-radius: .6rem;
font-size: .9rem;
}
.history-new:hover, .history-header button:hover { background: var(--grey-200);
}
.history-search { display: flex;
align-items: center;
gap: .5rem;
padding: .5rem .65rem;
border: 1px solid var(--grey-200);
border-radius: .7rem;
background: var(--scheme-main);
color: var(--text-muted);
margin-block: .5rem;
}
.history-search input { inline-size: 100%;
min-inline-size: 0;
background: transparent;
color: var(--text);
border: 0;
outline: none;
font-size: .85rem;
}
.history-search:focus-within { outline: 2px solid var(--primary);
outline-offset: 1px;
}
.history-filters { display: flex;
gap: .3rem;
margin-block: .6rem;
}
.history-filters button { display: inline-flex;
flex: 1;
align-items: center;
justify-content: center;
gap: .4rem;
min-block-size: 38px;
border-radius: .6rem;
font-size: .8rem;
}
.history-filters button:hover { background: var(--grey-100);
}
.history-filters button[aria-pressed='true'] { background: var(--grey-200);
font-weight: 600;
}
h3 { font-size: .75rem;
font-weight: 600;
color: var(--text-muted);
margin: 1.1rem .65rem .3rem;
}
ul { list-style: none;
margin: 0;
padding: 0;
}
li { position: relative;
display: flex;
align-items: center;
border-radius: .65rem;
min-inline-size: 0;
transition: background-color .12s ease;
}
li:hover, li:focus-within { background: var(--grey-200);
}
// Selection is a tinted row plus a bar, so it stays distinct from hover and does not rely on colour alone.
li.is-selected { background: hsla(var(--primary-hsl), .12);
}
li.is-selected:hover, li.is-selected:focus-within { background: hsla(var(--primary-hsl), .18);
}
li.is-selected::before { content: '';
position: absolute;
inset-block: .45rem;
inset-inline-start: 0;
inline-size: 3px;
border-radius: 3px;
background: var(--primary);
}
.history-link { flex: 1;
min-inline-size: 0;
text-align: start;
padding: .65rem;
min-block-size: 44px;
}
.history-link span { display: block;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
font-size: .85rem;
}
li.is-selected .history-link span { font-weight: 600;
}
.history-link small { display: block;
font-size: .75rem;
color: var(--text-muted);
margin-block-start: .25rem;
}
.pin-mark { inline-size: .65rem;
color: var(--text-muted);
flex-shrink: 0;
}
.history-empty, .history-note { font-size: .8rem;
color: var(--text-muted);
line-height: 1.6;
padding: .5rem;
}
.history-pages { display: flex;
justify-content: space-between;
align-items: center;
font-size: .8rem;
margin-block-start: .7rem;
}
.history-pages button { min-block-size: 44px;
}
@media (pointer: coarse) {
	.history-header button { inline-size: 44px;
	block-size: 44px;
	}
	.history-new, .history-filters button { min-block-size: 44px;
	}
}
@media (prefers-reduced-motion: reduce) { li { transition: none;
} }
</style>
