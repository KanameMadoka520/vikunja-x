<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {publicShowcaseQuery} from '@/client/queries/tcyShowcase'
import ShowcasePage from '@/components/showcase/ShowcasePage.vue'
import TcyBrand from '@/components/home/TcyBrand.vue'
import {useTitle} from '@/composables/useTitle'

const {t} = useI18n({useScope: 'global'})
const route = useRoute()
const query = useQuery(computed(() => publicShowcaseQuery(String(route.params.slug))))
useTitle(() => query.data.value?.title ?? t('tcymc.text.public_schedule'))
</script>

<template>
	<main class="tcy-public">
		<ShowcasePage
			v-if="query.data.value"
			:page="query.data.value"
		/>
		<div
			v-else
			class="public-state"
			:aria-busy="query.isPending.value || undefined"
		>
			<template v-if="query.isPending.value">
				<h1 class="public-state-title">
					{{ t('tcymc.text.loading_schedule') }}
				</h1>
				<div
					class="public-skeleton"
					aria-hidden="true"
				>
					<span class="public-skeleton-line is-wide" />
					<span class="public-skeleton-line" />
					<span class="public-skeleton-block" />
				</div>
			</template>
			<template v-else>
				<Icon
					icon="globe"
					class="public-state-icon"
				/>
				<h1 class="public-state-title">
					{{ t('tcymc.text.page_not_published_or_temporarily_unavailable') }}
				</h1>
				<p
					v-if="query.isError.value"
					class="public-state-text"
				>
					{{ t('tcymc.text.check_the_link_or_try_again_later') }}
				</p>
				<XButton
					variant="secondary"
					:shadow="false"
					:loading="query.isFetching.value"
					@click="query.refetch()"
				>
					{{ t('misc.retry') }}
				</XButton>
			</template>
			<TcyBrand class="public-state-brand" />
		</div>
	</main>
</template>

<style scoped lang="scss">
.tcy-public {
	min-block-size: 100dvh;
	background: var(--surface-app);
}

.public-state {
	display: grid;
	justify-items: center;
	gap: var(--space-3);
	max-inline-size: 32rem;
	margin-inline: auto;
	padding: var(--space-10) var(--page-gutter);
	text-align: center;
}

.public-state-icon {
	color: var(--text-tertiary);
	font-size: var(--text-2xl);
}

.public-state-title {
	margin: 0;
	color: var(--text-primary);
	font-size: var(--text-xl);
	font-weight: var(--weight-semibold);
	line-height: var(--leading-tight);
}

.public-state-text {
	color: var(--text-secondary);
	font-size: var(--text-md);
}

.public-state-brand {
	margin-block-start: var(--space-4);
}

.public-skeleton {
	display: grid;
	justify-items: center;
	gap: var(--space-3);
	inline-size: 100%;
	margin-block-start: var(--space-2);
}

.public-skeleton-line,
.public-skeleton-block {
	display: block;
	border-radius: var(--radius-md);
	background: var(--surface-active);
}

.public-skeleton-line {
	inline-size: 50%;
	block-size: .75rem;

	&.is-wide {
		inline-size: 80%;
	}
}

.public-skeleton-block {
	inline-size: 100%;
	block-size: 10rem;
}
</style>
