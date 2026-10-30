<template>
	<section
		class="workspace-side-section workspace-links"
		:aria-labelledby="headingId"
	>
		<h2
			:id="headingId"
			class="workspace-side-heading"
		>
			{{ heading }}
		</h2>
		<ul class="workspace-link-list">
			<li
				v-for="link in links"
				:key="link.id"
			>
				<RouterLink
					:to="link.to"
					class="workspace-link"
					:data-link="link.id"
				>
					<span
						class="workspace-link-icon"
						aria-hidden="true"
					>
						<AronaAvatar
							v-if="link.arona"
							size="small"
						/>
						<Icon
							v-else-if="link.icon"
							:icon="link.icon"
						/>
					</span>
					<span class="workspace-link-text">
						<span class="workspace-link-title">{{ link.title }}</span>
						<span class="workspace-link-description">{{ link.description }}</span>
					</span>
					<Icon
						icon="angle-right"
						class="workspace-link-chevron is-mirrored-rtl"
					/>
				</RouterLink>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
import type {RouteLocationRaw} from 'vue-router'
import type {IconProp} from '@fortawesome/fontawesome-svg-core'

import AronaAvatar from '@/components/ai/AronaAvatar.vue'
import Icon from '@/components/misc/Icon'

export interface WorkspaceLink {
	id: string
	to: RouteLocationRaw
	title: string
	description: string
	icon?: IconProp
	arona?: boolean
}

defineProps<{
	heading: string
	headingId: string
	links: WorkspaceLink[]
}>()
</script>

<style lang="scss" scoped>
.workspace-link-list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.workspace-link {
	display: flex;
	align-items: center;
	gap: .75rem;
	padding: .5rem;
	border-radius: $radius-large;
	color: var(--text);

	&:hover {
		background: var(--grey-100);

		.workspace-link-chevron {
			color: var(--text-muted);
		}
	}
}

.workspace-link-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	inline-size: 2rem;
	block-size: 2rem;
	border-radius: 50%;
	background: var(--grey-100);
	color: var(--primary);

	svg {
		inline-size: .9rem;
		block-size: .9rem;
	}
}

.workspace-link-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-inline-size: 0;
}

.workspace-link-title {
	color: var(--text-strong);
	font-weight: 600;
	line-height: 1.3;
}

.workspace-link-description {
	color: var(--text-muted);
	font-size: .8125rem;
	line-height: 1.35;
}

.workspace-link-chevron {
	flex-shrink: 0;
	color: var(--grey-300);
	transition: color $transition-duration ease;

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}
}
</style>
