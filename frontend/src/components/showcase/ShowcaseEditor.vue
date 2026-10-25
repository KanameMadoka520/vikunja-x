<script setup lang="ts">
import {computed, ref} from 'vue'
import {useProjects} from '@/composables/useProjects'
import {normalizeDraft, useSaveShowcase, usePreviewShowcase, usePublishShowcase, useUnpublishShowcase} from '@/client/queries/tcyShowcase'
import type {TcyShowcaseSettingsResponse, TcyShowcasePreviewResponse} from '@/client/generated'
import ShowcasePage from './ShowcasePage.vue'

const props = defineProps<{initial: TcyShowcaseSettingsResponse}>()
function seed() { return normalizeDraft(props.initial.draft) }
const draft = ref(seed())
const {projectsArray} = useProjects()
const save = useSaveShowcase()
const previewMutation = usePreviewShowcase()
const publish = usePublishShowcase()
const unpublish = useUnpublishShowcase()
const preview = ref<TcyShowcasePreviewResponse>()
const previewFingerprint = ref('')
const selectedProject = ref(0)
const busy = computed(() => save.isPending.value || previewMutation.isPending.value || publish.isPending.value || unpublish.isPending.value)
const readyToPublish = computed(() => Boolean(preview.value) && previewFingerprint.value === JSON.stringify(draft.value))
const publicURL = computed(() => `${window.location.origin}/p/${props.initial.published?.slug ?? draft.value.slug}`)
const jsonURL = computed(() => `${window.location.origin}/api/v2/public/${props.initial.published?.slug ?? draft.value.slug}`)
const weekdays = ['日', '一', '二', '三', '四', '五', '六']

function addProject() {
	if (!selectedProject.value || draft.value.projects.some(p => p.id === selectedProject.value)) return
	draft.value.projects.push({id: selectedProject.value, alias: '', mode: 'busy'})
}

function taskRule(id: number) {
	let rule = draft.value.tasks.find(t => t.id === id)
	if (!rule) { rule = {id, alias: '', hidden: false}; draft.value.tasks.push(rule) }
	return rule
}

async function showPreview() {
	try {
		const current = JSON.stringify(draft.value)
		preview.value = await previewMutation.mutateAsync(JSON.parse(current))
		previewFingerprint.value = current
	} catch { return }
}

async function saveDraft() { try { await save.mutateAsync(draft.value) } catch { return } }
async function publishDraft() { if (!readyToPublish.value) return; try { await publish.mutateAsync(draft.value) } catch { return } }
async function takeDown() { try { await unpublish.mutateAsync() } catch { return } }

function insertTemplate() {
	draft.value.content = '# 欢迎了解我的近况\n\n这里展示适合公开的安排。\n\n## 近期日程\n\n{{schedule}}\n\n## 可以联系我的时间\n\n{{availability}}\n\n## 进行中的项目\n\n{{projects}}'
	draft.value.format = 'markdown'
}
</script>

<template>
	<div class="showcase-editor">
		<header><h2>公开主页</h2><p>为朋友和机器人提供一份独立的公开日程。别名与隐藏规则只影响对外展示，不修改你的原始任务。</p></header>
		<div class="publication">
			<strong>{{ initial.published ? '已发布' : '尚未公开' }}</strong><template v-if="initial.published">
				<a
					:href="publicURL"
					target="_blank"
					rel="noopener noreferrer"
				>查看公开页面 ↗</a><a
					:href="jsonURL"
					target="_blank"
					rel="noopener noreferrer"
				>机器人 JSON 接口 ↗</a><button
					class="button"
					:disabled="busy"
					@click="takeDown"
				>
					撤下公开页面
				</button>
			</template>
		</div>
		<section class="editor-panel">
			<h3>页面与可联系时间</h3><div class="fields">
				<label>页面地址<input
					v-model="draft.slug"
					class="input"
					pattern="[a-z0-9][a-z0-9-]{2,47}"
					placeholder="例如 tcy"
				><small>/p/{{ draft.slug || 'your-name' }} · 3–48 位小写字母、数字或连字符</small></label><label>页面标题<input
					v-model="draft.title"
					class="input"
					maxlength="100"
				></label><label>展示未来天数<input
					v-model.number="draft.days"
					class="input"
					type="number"
					min="1"
					max="31"
				></label><label>每日开始小时<input
					v-model.number="draft.start_hour"
					class="input"
					type="number"
					min="0"
					max="23"
				></label><label>每日结束小时<input
					v-model.number="draft.end_hour"
					class="input"
					type="number"
					min="1"
					max="24"
				></label>
			</div><label>个人简介<textarea
				v-model="draft.intro"
				class="textarea"
				rows="2"
				maxlength="500"
			/></label><div class="weekdays">
				<label
					v-for="(day, index) in weekdays"
					:key="index"
				><input
					v-model="draft.weekdays"
					type="checkbox"
					:value="index"
				> 周{{ day }}</label>
			</div><p class="help">
				时区为北京时间。只有任务的开始—结束时间段会占用忙闲表；仅有截止日期的任务显示为截止事项。
			</p>
		</section>
		<section class="editor-panel">
			<h3>允许公开的项目</h3><p>未添加的项目完全不公开。默认只显示“忙碌”，公开项目名也使用别名。页面和 JSON 使用相同的公开范围。</p><div class="actions">
				<select
					v-model.number="selectedProject"
					class="input"
				>
					<option :value="0">
						选择项目
					</option><option
						v-for="project in projectsArray.filter(p => p.id > 0 && !p.is_archived)"
						:key="project.id"
						:value="project.id"
					>
						{{ project.title }}
					</option>
				</select><button
					class="button"
					@click="addProject"
				>
					添加展示规则
				</button>
			</div><div
				v-for="rule in draft.projects"
				:key="rule.id"
				class="project-rule"
			>
				<strong>{{ projectsArray.find(p => p.id === rule.id)?.title ?? `项目 #${rule.id}` }}</strong><label>公开别名<input
					v-model="rule.alias"
					class="input"
					placeholder="留空显示“私人项目”"
				></label><label>展示程度<select
					v-model="rule.mode"
					class="input"
				><option value="busy">只显示忙碌，不公开任务原名</option><option value="titles">公开任务标题（支持下方别名覆盖）</option><option value="hidden">完全隐藏，不参与忙闲计算</option></select></label><button
					class="button is-text"
					@click="draft.projects = draft.projects.filter(p => p.id !== rule.id)"
				>
					移除
				</button>
			</div>
		</section>
		<section class="editor-panel">
			<h3>自定义 Markdown / HTML</h3><label><input
				v-model="draft.custom_layout"
				type="checkbox"
			> 使用完全自定义正文（隐藏默认日程面板）</label><div class="actions">
				<select
					v-model="draft.format"
					class="input"
				>
					<option value="markdown">
						Markdown
					</option><option value="html">
						静态 HTML（可包含样式）
					</option>
				</select><button
					class="button"
					@click="insertTemplate"
				>
					插入日程模板
				</button>
			</div><textarea
				v-model="draft.content"
				class="textarea template-editor"
				rows="10"
				maxlength="80000"
				placeholder="写一段介绍，或者使用模板占位符嵌入公开日程。"
			/><p
				class="help"
				v-text="'可用占位符：{{schedule}}、{{availability}}、{{projects}}。HTML 在隔离框架内展示，脚本和表单不会运行。'"
			/>
		</section>
		<section
			v-if="preview?.sources?.length"
			class="editor-panel"
		>
			<h3>单个任务的对外别名与隐藏</h3><p>下方原名仅供你编辑，不会包含在公开接口中。修改后请重新预览。</p><div
				v-for="task in preview.sources"
				:key="task.id"
				class="task-rule"
			>
				<strong>{{ task.title }}</strong><input
					class="input"
					:value="draft.tasks.find(t => t.id === task.id)?.alias ?? ''"
					placeholder="对外别名，留空按项目规则"
					@input="taskRule(task.id!).alias = ($event.target as HTMLInputElement).value"
				><label><input
					type="checkbox"
					:checked="draft.tasks.find(t => t.id === task.id)?.hidden ?? false"
					@change="taskRule(task.id!).hidden = ($event.target as HTMLInputElement).checked"
				> 完全隐藏</label>
			</div>
		</section>
		<div class="actions">
			<button
				class="button"
				:disabled="busy"
				@click="saveDraft"
			>
				保存草稿
			</button><button
				class="button"
				:disabled="busy"
				@click="showPreview"
			>
				预览公开效果
			</button><button
				class="button is-primary"
				:disabled="busy || !readyToPublish"
				@click="publishDraft"
			>
				发布当前预览
			</button>
		</div><p class="help">
			先预览，再发布。发布后日程按已发布规则实时更新；修改草稿不会改变公开页面，重新发布才会生效。
		</p>
		<section
			v-if="preview?.page"
			class="preview-panel"
		>
			<h3>外人看到的效果</h3><p
				v-if="!readyToPublish"
				class="help"
			>
				草稿已变更，请重新预览后再发布。
			</p><ShowcasePage :page="preview.page" />
		</section>
	</div>
</template>

<style scoped>
.showcase-editor {
	display: grid;
	gap: 1.25rem;
	}
h2 {
	font-size: 1.8rem;
	margin-block-end: .75rem;
	}
h3 {
	font-size: 1.15rem;
	margin-block-end: .75rem;
	}
.editor-panel, .preview-panel {
	padding: 1.25rem;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	background: var(--white);
	}
.fields {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 1rem;
	}
label {
	display: grid;
	gap: .4rem;
	margin-block: .5rem;
	font-size: .9rem;
	}
.help, small {
	font-size: .8rem;
	color: var(--grey-600);
	margin-block-start: .75rem;
	}
.publication, .actions, .weekdays {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 1rem;
	}
.actions > select {
	inline-size: auto;
	max-inline-size: 100%;
	}
.weekdays label {
	display: flex;
	gap: .25rem;
	}
.project-rule, .task-rule {
	display: grid;
	gap: .75rem;
	padding-block: 1rem;
	border-block-end: 1px solid var(--grey-200);
	}
.template-editor {
	margin-block-start: 1rem;
	font-family: monospace;
	}
</style>
