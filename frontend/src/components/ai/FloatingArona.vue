<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, ref, watch, onMounted, onBeforeUnmount, shallowRef} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useBaseStore} from '@/stores/base'
import {useAuthStore} from '@/stores/auth'
import {captureClientRequestContext} from '@/client/requestContext'
import AronaAvatar from './AronaAvatar.vue'
import BaseButton from '@/components/base/BaseButton.vue'
const Assistant = defineAsyncComponent(() => import('@/views/TcyAssistant.vue'))
const {t} = useI18n({useScope: 'global'})
const route = useRoute()
const router = useRouter()
const base = useBaseStore()
const auth = useAuthStore()
const open = ref(false)
const loaded = ref(false)
const running = ref(false)
const navigationBusy = ref(false)
const conversation = ref('')
const launcher = ref<InstanceType<typeof BaseButton>>()
const panel = ref<HTMLElement>()
const portal = shallowRef<string | HTMLElement>('body')
let modalObserver: MutationObserver | undefined
onMounted(() => {
	const update = () => { portal.value = document.querySelector<HTMLDialogElement>('dialog.task-detail-view-modal[open]') || 'body' }
	modalObserver = new MutationObserver(update)
	modalObserver.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['open']})
	update()
})
onBeforeUnmount(() => modalObserver?.disconnect())
const fullPage = computed(() => route.name === 'tcy-ai')
const taskID = computed(() => route.name === 'task.detail' ? Number(route.params.id) || 0 : 0)
const accountKey = computed(() => {
	// Depend on the reactive account too: token renewals must not reset a conversation.
	const context = captureClientRequestContext()
	return JSON.stringify([context.apiBaseUrl, auth.info?.id, context.identity?.type])
})
watch(accountKey, key => {
	open.value = false; loaded.value = false; running.value = false
	try { conversation.value = sessionStorage.getItem(`arona-floating:${key}`) || '' } catch { conversation.value = '' }
}, {immediate: true})
watch(conversation, id => {try { sessionStorage.setItem(`arona-floating:${accountKey.value}`, id) } catch { /* Browser storage is optional. */ }})
watch(() => route.query.chat, id => {if (fullPage.value && typeof id === 'string') conversation.value = id}, {immediate: true})
async function toggle() {
	open.value = !open.value
	if (open.value) { loaded.value = true; await nextTick(); panel.value?.focus() }
}
function minimize() { open.value = false; nextTick(() => launcher.value?.$el?.focus()) }
function expand() { open.value = false; void router.push({name: 'tcy-ai', query: {chat: conversation.value || undefined, project: base.currentProjectId || undefined}}) }
</script>

<template>
	<Teleport :to="portal">
		<div
			v-if="!fullPage"
			class="floating-arona d-print-none"
			@mousedown.stop
			@pointerdown.stop
			@click.stop
		>
			<section
				v-if="loaded"
				v-show="open"
				ref="panel"
				class="arona-panel"
				role="region"
				tabindex="-1"
				:aria-label="t('floatingArona.title')"
				@keydown.esc.prevent.stop="minimize"
			>
				<header class="panel-header">
					<strong>{{ t('floatingArona.title') }}</strong>
					<span class="panel-hint">{{ t(running ? 'floatingArona.working' : 'floatingArona.context') }}</span>
					<BaseButton
						class="panel-button"
						:aria-label="t('floatingArona.expand')"
						:title="t('floatingArona.expand')"
						:disabled="navigationBusy"
						@click="expand"
					>
						<Icon icon="arrow-up-right-from-square" />
					</BaseButton>
					<BaseButton
						class="panel-button"
						:aria-label="t('floatingArona.minimize')"
						:title="t('floatingArona.minimize')"
						@click="minimize"
					>
						<Icon icon="minus" />
					</BaseButton>
				</header>
				<div class="panel-body">
					<Assistant
						v-if="loaded"
						:key="accountKey"
						v-model:conversation-id="conversation"
						embedded
						:context-project-id="base.currentProjectId || 0"
						:context-task-id="taskID"
						@activity="running = $event"
						@navigationBusy="navigationBusy = $event"
					/>
				</div>
			</section>
			<BaseButton
				ref="launcher"
				class="arona-launcher"
				:class="{working: running}"
				:aria-label="t(open ? 'floatingArona.minimize' : 'floatingArona.open')"
				:aria-expanded="open"
				:title="t('floatingArona.open')"
				@click="toggle"
			>
				<AronaAvatar />
				<span
					v-if="running"
					class="activity-dot"
					:aria-label="t('floatingArona.working')"
				/>
			</BaseButton>
		</div>
	</Teleport>
</template>

<style scoped lang="scss">
.floating-arona { position: fixed;
inset-inline-end: max(1rem, env(safe-area-inset-right));
inset-block-end: max(1rem, env(safe-area-inset-bottom));
z-index: 60;
}
.arona-launcher { display: flex;
align-items: center;
justify-content: center;
inline-size: 3.25rem;
block-size: 3.25rem;
margin-inline-start: auto;
padding: 0;
border: 1px solid var(--grey-200);
border-radius: 50%;
background: var(--white);
box-shadow: 0 3px 16px #00000022;
position: relative;
transition: transform .16s ease;
}
.arona-launcher:hover { transform: translateY(-2px);
}
.activity-dot { position: absolute;
inset: .1rem .1rem auto auto;
inline-size: .65rem;
block-size: .65rem;
border-radius: 50%;
background: var(--success);
border: 2px solid var(--white);
}
.arona-panel { display: flex;
flex-direction: column;
inline-size: min(460px, calc(100vw - 2rem));
block-size: min(720px, calc(100dvh - 6.5rem));
margin-block-end: .75rem;
border: 1px solid var(--grey-200);
border-radius: 1.25rem;
background: var(--white);
box-shadow: 0 10px 50px #00000033;
overflow: hidden;
outline: none;
}
.panel-header { display: flex;
align-items: center;
gap: .35rem;
padding: .35rem .6rem;
border-block-end: 1px solid var(--grey-100);
flex-shrink: 0;
}
.panel-header strong { font-size: .85rem;
white-space: nowrap;
}
.panel-hint { flex: 1;
color: var(--grey-600);
font-size: .65rem;
}
.panel-button { display: grid;
place-items: center;
inline-size: 2.5rem;
block-size: 2.5rem;
border-radius: .6rem;
flex-shrink: 0;
}
.panel-button:hover { background: var(--grey-100);
}
.panel-body { flex: 1;
min-block-size: 0;
overflow: hidden;
}
@media (width <= 540px) { .floating-arona { inset-inline-end: .5rem;
inset-block-end: max(.5rem, env(safe-area-inset-bottom));
} .arona-panel { inline-size: calc(100vw - 1rem);
block-size: calc(100dvh - 6rem - env(safe-area-inset-bottom));
} }
@media (prefers-reduced-motion: reduce) { .arona-launcher { transition: none;
} }
</style>
