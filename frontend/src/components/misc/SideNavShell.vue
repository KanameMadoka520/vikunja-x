<template>
	<div class="content-widescreen">
		<div class="side-nav-shell">
			<nav
				class="side-nav"
				:aria-label="label || undefined"
				@keydown.esc="closeMenu(true)"
			>
				<button
					ref="toggleRef"
					type="button"
					class="side-nav__toggle"
					:aria-expanded="menuOpen"
					:aria-controls="listId"
					@click="menuOpen = !menuOpen"
				>
					<span class="side-nav__toggle-text">
						<span
							v-if="label"
							class="side-nav__toggle-section"
						>{{ label }}</span>
						<span class="side-nav__toggle-current">
							<Icon
								v-if="activeItem?.icon"
								:icon="activeItem.icon"
								class="side-nav__icon"
							/>
							{{ activeItem?.title ?? label }}
						</span>
					</span>
					<Icon
						icon="chevron-down"
						class="side-nav__chevron"
					/>
				</button>
				<div
					:id="listId"
					class="side-nav__groups"
					:class="{'is-open': menuOpen}"
				>
					<div
						v-for="(group, groupIndex) in groups"
						:key="`group-${groupIndex}`"
						class="side-nav__group"
					>
						<p
							v-if="group.title"
							:id="`${listId}-${groupIndex}`"
							class="side-nav__heading"
						>
							{{ group.title }}
						</p>
						<ul :aria-labelledby="group.title ? `${listId}-${groupIndex}` : undefined">
							<li
								v-for="item in group.items"
								:key="item.routeName"
							>
								<RouterLink
									v-slot="{href, navigate, isActive, isExactActive}"
									:to="{name: item.routeName}"
									custom
								>
									<a
										:href="href"
										class="side-nav__link navigation-link"
										:class="{'is-active': isItemActive(item, exact ? isExactActive : isActive)}"
										:aria-current="isItemActive(item, exact ? isExactActive : isActive) ? 'page' : undefined"
										@click="navigate"
									>
										<Icon
											v-if="item.icon"
											:icon="item.icon"
											class="side-nav__icon"
										/>
										<span class="side-nav__title">{{ item.title }}</span>
										<span
											v-if="item.badge"
											class="side-nav__badge"
											aria-hidden="true"
										>{{ item.badge }}</span>
									</a>
								</RouterLink>
							</li>
						</ul>
					</div>
					<div
						v-if="extraLinks.length > 0"
						class="side-nav__group"
					>
						<p
							v-if="extraLinksLabel"
							:id="`${listId}-extra`"
							class="side-nav__heading"
						>
							{{ extraLinksLabel }}
						</p>
						<ul :aria-labelledby="extraLinksLabel ? `${listId}-extra` : undefined">
							<li
								v-for="({url, text}, index) in extraLinks"
								:key="`extra-${index}`"
							>
								<BaseButton
									class="side-nav__link navigation-link"
									:href="url"
								>
									<span class="side-nav__title">{{ text }}</span>
									<Icon
										icon="arrow-up-right-from-square"
										class="side-nav__external"
									/>
								</BaseButton>
							</li>
						</ul>
					</div>
				</div>
			</nav>
			<section class="view">
				<RouterView />
			</section>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, useId, watch} from 'vue'
import {useRoute} from 'vue-router'
import type {IconProp} from '@fortawesome/fontawesome-svg-core'

import BaseButton from '@/components/base/BaseButton.vue'

export interface SideNavItem {
	icon?: IconProp
	title: string
	routeName: string
	activeRouteNames?: string[]
	// Consecutive items with the same group title render under one heading.
	group?: string
	// Visual scope hint; the group heading carries it for assistive tech so link names stay stable.
	badge?: string
}

export interface SideNavExtraLink {
	url: string
	text: string
}

const props = withDefaults(defineProps<{
	navigationItems: SideNavItem[]
	extraLinks?: SideNavExtraLink[]
	extraLinksLabel?: string
	exact?: boolean
	label?: string
}>(), {
	extraLinks: () => [],
	extraLinksLabel: '',
	exact: false,
	label: '',
})

const route = useRoute()
const listId = useId()
const menuOpen = ref(false)
const toggleRef = ref<HTMLButtonElement | null>(null)

const groups = computed(() => {
	const result: {title: string, items: SideNavItem[]}[] = []
	for (const item of props.navigationItems) {
		const title = item.group ?? ''
		const last = result[result.length - 1]
		if (last && last.title === title) {
			last.items.push(item)
		} else {
			result.push({title, items: [item]})
		}
	}
	return result
})

function isAliasActive(item: SideNavItem) {
	return item.activeRouteNames?.includes(route.name as string) ?? false
}

function isItemActive(item: SideNavItem, routerActive: boolean) {
	return routerActive || isAliasActive(item)
}

const activeItem = computed(() => props.navigationItems.find(item =>
	item.routeName === route.name || isAliasActive(item),
))

function closeMenu(restoreFocus = false) {
	if (!menuOpen.value) return
	menuOpen.value = false
	if (restoreFocus) toggleRef.value?.focus()
}

watch(() => route.fullPath, () => closeMenu())
</script>

<style lang="scss" scoped>
.side-nav-shell {
	display: grid;
	grid-template-columns: minmax(11rem, 14.5rem) minmax(0, 1fr);
	gap: var(--space-6);
	align-items: start;
	min-inline-size: 0;

	@media screen and (max-width: $tablet) {
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
	}
}

.side-nav {
	position: sticky;
	inset-block-start: calc(var(--header-height) + var(--space-4));
	max-block-size: calc(100dvh - var(--header-height) - var(--space-8));
	overflow-y: auto;
	overscroll-behavior: contain;
	min-inline-size: 0;
	padding-block-end: var(--space-2);

	@media screen and (max-width: $tablet) {
		position: static;
		max-block-size: none;
		overflow: visible;
		padding-block-end: 0;
	}
}

.side-nav__toggle {
	display: none;

	@media screen and (max-width: $tablet) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		inline-size: 100%;
		min-block-size: var(--control-height-lg);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface);
		box-shadow: var(--elevation-1);
		color: var(--text-primary);
		font: inherit;
		text-align: start;
		cursor: pointer;

		&:hover {
			background-image: linear-gradient(var(--surface-hover), var(--surface-hover));
		}

		&:focus-visible {
			@include focus-ring;
		}
	}
}

.side-nav__toggle-text {
	display: flex;
	flex-direction: column;
	min-inline-size: 0;
}

.side-nav__toggle-section {
	color: var(--text-tertiary);
	font-size: var(--text-xs);
	font-weight: var(--weight-medium);
}

.side-nav__toggle-current {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	font-size: var(--text-base);
	font-weight: var(--weight-semibold);
	overflow-wrap: anywhere;
}

.side-nav__chevron {
	flex-shrink: 0;
	color: var(--text-secondary);
	transition: transform var(--motion-fast) var(--ease-standard);

	[aria-expanded='true'] > & {
		transform: rotate(180deg);
	}
}

.side-nav__groups {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);

	@media screen and (max-width: $tablet) {
		display: none;
		margin-block-start: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface);
		box-shadow: var(--elevation-2);

		&.is-open {
			display: flex;
		}
	}
}

.side-nav__heading {
	margin-block-end: var(--space-1);
	padding-inline: var(--space-3);
	color: var(--text-tertiary);
	font-size: var(--text-xs);
	font-weight: var(--weight-semibold);
	letter-spacing: .02em;
}

.side-nav ul {
	display: flex;
	flex-direction: column;
	gap: 1px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.side-nav__link {
	position: relative;
	display: flex;
	align-items: center;
	gap: var(--space-2);
	inline-size: 100%;
	min-block-size: var(--control-height);
	padding: var(--space-1) var(--space-3);
	border-radius: var(--radius-sm);
	color: var(--text-secondary);
	font-size: var(--text-md);
	font-weight: var(--weight-medium);
	line-height: var(--leading-tight);
	text-align: start;
	text-decoration: none;
	transition:
		background-color var(--motion-fast) var(--ease-standard),
		color var(--motion-fast) var(--ease-standard);

	&:hover {
		background-color: var(--surface-hover);
		color: var(--text-primary);
	}

	&:focus-visible {
		@include focus-ring;
	}

	&.is-active {
		background-color: var(--surface-selected);
		color: var(--accent-text);
		font-weight: var(--weight-semibold);

		&::before {
			content: '';
			position: absolute;
			inset-block: var(--space-2);
			inset-inline-start: 0;
			inline-size: 2px;
			border-radius: var(--radius-full);
			background: var(--accent-text);
		}

		.side-nav__icon {
			color: inherit;
		}
	}
}

.side-nav__icon {
	flex-shrink: 0;
	inline-size: 1rem;
	color: var(--text-tertiary);
}

.side-nav__title {
	flex: 1 1 auto;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.side-nav__badge {
	flex-shrink: 0;
	padding: 0 var(--space-2);
	border: 1px solid var(--border-default);
	border-radius: var(--radius-full);
	color: var(--text-secondary);
	font-size: var(--text-2xs);
	font-weight: var(--weight-semibold);
	line-height: 1.6;
}

.side-nav__external {
	flex-shrink: 0;
	color: var(--text-tertiary);
	font-size: var(--text-xs);
}

.view {
	min-inline-size: 0;
}
</style>
