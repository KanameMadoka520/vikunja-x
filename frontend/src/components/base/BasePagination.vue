<template>
	<nav
		v-if="totalPages > 1"
		:aria-label="$t('tcymc.pagination')"
		class="pagination is-centered p-4"
		role="navigation"
	>
		<slot
			name="previous"
			:disabled="currentPage <= 1"
		>
			{{ $t('misc.previous') }}
		</slot>
		<slot
			name="next"
			:disabled="currentPage >= totalPages"
		>
			{{ $t('misc.next') }}
		</slot>
		<ul class="pagination-list">
			<li
				v-for="(p, i) in pages"
				:key="`page-${i}`"
			>
				<span
					v-if="p.isEllipsis"
					class="pagination-ellipsis"
				>&hellip;</span>
				<slot
					v-else
					name="page-link"
					:page="p"
					:is-current="p.number === currentPage"
				>
					{{ p.number }}
				</slot>
			</li>
		</ul>
	</nav>
</template>

<script lang="ts" setup>
import {computed} from 'vue'

interface PaginationPage {
	number: number
	isEllipsis: boolean
}

const props = defineProps<{
	totalPages: number,
	currentPage: number
}>()

function createPagination(totalPages: number, currentPage: number): PaginationPage[] {
	const pages: PaginationPage[] = []
	for (let i = 0; i < totalPages; i++) {
		if (
			i > 0 &&
			(i + 1) < totalPages &&
			((i + 1) > currentPage + 1 || (i + 1) < currentPage - 1)
		) {
			const prevPage = pages[i - 1]
			if (prevPage && !prevPage.isEllipsis) {
				pages.push({
					number: 0,
					isEllipsis: true,
				})
			}
			continue
		}

		pages.push({
			number: i + 1,
			isEllipsis: false,
		})
	}
	return pages
}

const pages = computed(() => createPagination(props.totalPages, props.currentPage))
</script>

<style lang="scss" scoped>
// Layout/scaffold rules ported from bulma-css-variables/sass/components/pagination.sass.
// BasePagination only owns .pagination / .pagination-list / .pagination-ellipsis —
// the actual pagination items (.pagination-previous / -next / -link) and their
// styles live in PaginationItem.vue.

.pagination {
	align-items: center;
	display: flex;
	font-size: var(--text-md);
	justify-content: center;
	margin: calc(-1 * var(--space-1));
	padding-block-end: var(--space-4);
	text-align: center;
}

.pagination-list {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	text-align: center;

	&, & li {
		margin-block-start: 0;
	}

	li {
		list-style: none;
	}
}

.pagination-ellipsis {
	align-items: center;
	display: inline-flex;
	justify-content: center;
	min-block-size: var(--control-height);
	min-inline-size: var(--space-6);
	margin: var(--space-1);
	line-height: 1.5;
	vertical-align: top;

	-webkit-touch-callout: none;
	user-select: none;

	color: var(--text-tertiary);
	pointer-events: none;
}

@media screen and (max-width: $tablet - 1px) {
	.pagination {
		flex-wrap: wrap;
	}

	.pagination-list li {
		flex-grow: 1;
		flex-shrink: 1;
	}
}

@media screen and (min-width: $tablet), print {
	.pagination-list {
		flex-grow: 1;
		flex-shrink: 1;
	}

	.pagination-ellipsis {
		margin-block: 0;
	}

	.pagination {
		justify-content: space-between;
		margin-block: 0;

		&.is-centered {
			.pagination-list {
				justify-content: center;
				order: 2;
			}
		}
	}
}
</style>
