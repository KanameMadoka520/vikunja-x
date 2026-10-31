<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, ref, watch, onMounted, onBeforeUnmount, shallowRef, useId} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useBaseStore} from '@/stores/base'
import {useAuthStore} from '@/stores/auth'
import {useIsMobile} from '@/composables/useIsMobile'
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
const activityId = useId()
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
// The phone drawer is modal; the dock steps aside (state and streaming stay mounted).
const isMobile = useIsMobile()
const underDrawer = computed(() => isMobile.value && base.menuActive)
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
			:class="{'is-under-drawer': underDrawer}"
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
					>
						<template #panel-actions>
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
						</template>
					</Assistant>
				</div>
			</section>
			<BaseButton
				ref="launcher"
				class="arona-launcher"
				:class="{working: running}"
				:aria-label="t(open ? 'floatingArona.minimize' : 'floatingArona.open')"
				:aria-expanded="open"
				:aria-describedby="running ? activityId : undefined"
				:title="t('floatingArona.open')"
				@click="toggle"
			>
				<AronaAvatar />
				<span
					v-if="running"
					class="activity-dot"
					aria-hidden="true"
					:title="t('floatingArona.working')"
				/>
			</BaseButton>
			<!-- The launcher keeps its name; the running state is its description. -->
			<span
				:id="activityId"
				class="is-sr-only"
			>{{ t('floatingArona.working') }}</span>
		</div>
	</Teleport>
</template>

<style scoped lang="scss">
.floating-arona {
	position: fixed;
	inset-inline-end: var(--dock-inset-inline);
	inset-block-end: var(--dock-inset-block);
	z-index: var(--layer-floating);
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: var(--space-3);

	&.is-under-drawer {
		visibility: hidden;
	}
}

.arona-launcher {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	inline-size: var(--dock-launcher-size);
	block-size: var(--dock-launcher-size);
	padding: 0;
	border: 1px solid var(--border-default);
	border-radius: var(--radius-full);
	background: var(--surface-raised);
	box-shadow: var(--elevation-2);
	transition: transform var(--motion-fast) var(--ease-standard);

	&:hover {
		transform: translateY(-1px);
	}
}

.activity-dot {
	position: absolute;
	inset-block-start: 0;
	inset-inline-end: 0;
	inline-size: .625rem;
	block-size: .625rem;
	border: 2px solid var(--surface-raised);
	border-radius: var(--radius-full);
	background: var(--success);
	box-sizing: content-box;
}

.arona-panel {
	display: flex;
	flex-direction: column;
	inline-size: min(460px, calc(100vw - 2 * var(--dock-inset-inline)));
	// Leaves the header usable above the panel and the launcher below it.
	block-size: min(720px, calc(100dvh - var(--header-height) - var(--dock-reserve) - var(--space-2)));
	overflow: hidden;
	border: 1px solid var(--border-default);
	border-radius: var(--radius-lg);
	background: var(--surface-raised);
	box-shadow: var(--elevation-3);
	outline: none;
}

// Same shape as the assistant's toolbar buttons in the row they join.
.panel-button {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	inline-size: var(--control-height);
	block-size: var(--control-height);
	border-radius: var(--radius-sm);
	color: var(--text-secondary);

	&:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	&:disabled {
		opacity: .5;
		cursor: not-allowed;
	}

	@media (pointer: coarse) {
		inline-size: var(--target-min);
		block-size: var(--target-min);
	}
}

.panel-body {
	flex: 1;
	min-block-size: 0;
	overflow: hidden;
}
</style>
