<template>
	<Teleport :to="teleportTarget">
		<Notifications
			position="bottom left"
			:max="2"
			:ignore-duplicates="true"
			class="global-notification"
			role="status"
			aria-live="polite"
		>
			<template #body="{ item, close }">
				<!-- FIXME: overlay whole notification with button and add event listener on that button instead -->
				<div
					class="vue-notification-template vue-notification"
					:class="[
						item.type,
					]"
					@click="close()"
				>
					<div
						v-if="item.title"
						class="notification-title"
					>
						{{ item.title }}
					</div>
					<div class="notification-content">
						<template v-if="Array.isArray(item.text)">
							<template
								v-for="(t, k) in item.text"
								:key="k"
							>
								{{ t }}<br>
							</template>
						</template>
						<template v-else>
							{{ item.text }}
						</template>
						<span
							v-if="item.duplicates > 0"
							class="tw:text-xs tw:font-bold tw:ml-1"
						>
							×{{ item.duplicates + 1 }}
						</span>
					</div>
					<XButton
						v-if="item.type === 'error' && diagnostics.length"
						variant="secondary"
						class="is-small mbs-2"
						:shadow="false"
						icon="code"
						@click.stop="openDiagnostics(); close()"
					>
						{{ $t('debug.title') }}
					</XButton>
					<div
						v-if="item.data?.actions?.length > 0"
						class="mbs-2 tw:flex tw:justify-end tw:gap-2"
					>
						<XButton
							v-for="(action, i) in item.data.actions"
							:key="'action_' + i"
							:shadow="false"
							class="is-small"
							variant="secondary"
							@click="action.callback"
						>
							{{ action.title }}
						</XButton>
					</div>
				</div>
			</template>
		</Notifications>
	</Teleport>
</template>

<script lang="ts" setup>
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {diagnostics, openDiagnostics} from '@/helpers/diagnostics'

const teleportTarget = ref<string | HTMLElement>('body')
let observer: MutationObserver | null = null

function syncTeleportTarget() {
	const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog.modal-dialog[open]')
	teleportTarget.value = dialogs.item(dialogs.length - 1) ?? 'body'
}

onMounted(() => {
	syncTeleportTarget()
	observer = new MutationObserver(syncTeleportTarget)
	observer.observe(document.body, {
		attributes: true,
		attributeFilter: ['open'],
		childList: true,
		subtree: true,
	})
})

onBeforeUnmount(() => {
	observer?.disconnect()
	observer = null
})
</script>

<style lang="scss" scoped>
.vue-notification {
	z-index: var(--layer-toast);
	margin: 0 .5rem .5rem;
	padding: .65rem .85rem;
	border: 1px solid var(--border-default);
	border-inline-start: 3px solid var(--primary);
	border-radius: var(--radius-md);
	background: var(--surface-raised);
	color: var(--text-primary);
	box-shadow: var(--elevation-3);
	font-size: var(--text-md);
	line-height: 1.45;
	cursor: pointer;

	&.success {
		border-inline-start-color: var(--success);
	}

	&.warn {
		border-inline-start-color: var(--warning);
	}

	&.error {
		border-inline-start-color: var(--danger);
	}
}

.notification-title {
	font-weight: var(--weight-semibold);
	margin-block-end: .125rem;
}

.notification-content {
	color: var(--text-secondary);
	overflow-wrap: anywhere;

	.notification-title + & {
		font-size: var(--text-sm);
	}
}
</style>

<style lang="scss">
// The library fades with `transition: all .5s`; keep it to a short opacity/transform fade.
.global-notification {
	.vn-fade-enter-active,
	.vn-fade-leave-active,
	.vn-fade-move {
		transition:
			opacity var(--motion-base) var(--ease-standard),
			transform var(--motion-base) var(--ease-standard);
	}

	.vn-fade-enter-from,
	.vn-fade-leave-to {
		opacity: 0;
		transform: translateY(6px);
	}
}
</style>
