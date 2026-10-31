<template>
	<component
		:is="compact ? 'nav' : 'section'"
		class="workspace-side-section workspace-links"
		:class="{'is-compact': compact}"
		:aria-labelledby="headingId"
	>
		<h2
			:id="headingId"
			class="workspace-side-heading"
			:class="{'is-sr-only': compact}"
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
					<span
						v-if="compact"
						class="workspace-link-title"
					>{{ link.title }}</span>
					<span
						v-else
						class="workspace-link-text"
					>
						<span class="workspace-link-title">{{ link.title }}</span>
						<span class="workspace-link-description">{{ link.description }}</span>
					</span>
					<Icon
						v-if="!compact"
						icon="angle-right"
						class="workspace-link-chevron is-mirrored-rtl"
					/>
				</RouterLink>
			</li>
		</ul>
	</component>
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

withDefaults(defineProps<{
	heading: string
	headingId: string
	links: WorkspaceLink[]
	// A single row of pills (titles only) for narrow layouts.
	compact?: boolean
}>(), {
	compact: false,
})
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
	gap: var(--space-3);
	padding: var(--space-2);
	border-radius: var(--radius-md);
	color: var(--text-primary);

	&:hover {
		background: var(--surface-hover);

		.workspace-link-chevron {
			color: var(--text-tertiary);
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
	border-radius: var(--radius-full);
	background: var(--surface-selected);
	color: var(--accent-text);

	svg {
		inline-size: .875rem;
		block-size: .875rem;
	}
}

.workspace-link-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-inline-size: 0;
}

.workspace-link-title {
	color: var(--text-primary);
	font-size: var(--text-md);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
}

.workspace-link-description {
	color: var(--text-tertiary);
	font-size: var(--text-sm);
	line-height: 1.35;
}

.workspace-link-chevron {
	flex-shrink: 0;
	color: var(--border-strong);
}

.is-compact {
	.workspace-link-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.workspace-link {
		gap: var(--space-2);
		min-block-size: var(--control-height);
		padding-block: 0;
		padding-inline: var(--space-1) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);
		background: var(--surface);

		&:hover {
			background-image: linear-gradient(var(--surface-hover), var(--surface-hover));
		}
	}

	.workspace-link-icon {
		inline-size: 1.5rem;
		block-size: 1.5rem;

		svg {
			inline-size: .75rem;
			block-size: .75rem;
		}
	}

	.workspace-link-title {
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}
}
</style>
