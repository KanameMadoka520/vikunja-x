# Vikunja X · tcymc二次开发版

基于 [Vikunja 官方 v2.7.1](https://github.com/go-vikunja/vikunja/releases/tag/v2.7.1) 的个人任务管理扩展，由 **KanameMadoka520** 维护。保留上游项目、任务、甘特图、看板、提醒、CalDAV 和 MCP，增加可配置模型的 AI 助手、语音输入和独立公开主页。

- 源码与问题反馈：[KanameMadoka520/vikunja-x](https://github.com/KanameMadoka520/vikunja-x)
- 版本：`v2.7.1-tcymc.5`
- 许可证：AGPL-3.0-or-later；上游版权和许可证继续适用，参见 [LICENSE](LICENSE) 与 [上游 README](README.upstream.md)。本项目是独立二次开发版。

## 可重放的界面引导

首次登录进入总览时，会出现可关闭的教程提示。点击右上角 **问号图标 → 帮助与引导教程**，或使用头像菜单中的同名入口，可以随时选择、重放三组高亮教程：

- **基础使用（9 步）**：总览、项目、快速添加、日期与时间段、团队协作、搜索、AI、个人设置和帮助入口。
- **AI 与语音（7 步）**：模型连接、协议与端点、获取或手填模型、功能分工、保存测试、权限和语音输入。
- **公开展示（6 步）**：发布状态、可联系时段、别名和隐藏规则、自定义正文、预览与发布。

教程会前往相关页面，但不会自动编辑、保存、发起 AI 请求、录音或发布内容；开始前请保存正在编辑的表单。支持上一步、下一步、跳过、键盘左右键、Esc 退出和完成后重放。手机上按步骤展开或收起侧边栏，说明卡片适应屏幕并可滚动；不可用的区域会给出继续或退出提示。

首次提示和完成状态按 **API 服务地址 + 用户账号** 记录在当前浏览器，本地存储被禁用时仍可使用教程。公开访客页、分享访客页和登录页不显示私人工作台教程。图标沿用 Font Awesome SVG，设置菜单、AI、语音和公开主页的主要操作补充了图标。

## 保存会话的任务助手

进入侧边栏 **AI 任务助手**。左侧新建、选择、重命名或删除会话；消息支持 Enter 发送、Shift+Enter 换行、复制 Markdown 回答和停止执行。默认只读，可为每次请求选择模型、项目及操作权限。

- **真实过程**：展开“思考与执行步骤”查看服务商主动返回的思考文字或思考摘要、每轮模型请求、工具参数、真实结果及耗时。服务商没有返回时明确提示未提供；签名和加密推理上下文仅在服务器保存，不作为可读思考内容展示。
- **请求详情**：显示请求和实际返回的模型、协议、端点、当轮实际系统提示词、输入/输出/缓存/思考 Token、总耗时、首个 Token 和首段回答时间。用量来自服务商，不进行估算；缓存及思考 Token 已包含在输入或输出中。首个 Token 以首段流式文字或思考为准，非流式响应不伪造首字时间。
- **压缩上下文**：超过四轮后可使用当前模型生成较早消息摘要。保留原文，后续请求使用最新摘要和最近四轮。压缩仅总结，不执行任务工具；仍消耗模型用量。
- **创建分支**：从某条回复复制到该处的历史及模型上下文，原会话保留。分支不会回滚或重做真实任务操作。
- **可靠续用**：会话绑定当前账户，服务器加密保存。页面刷新后可恢复查看进行中的执行。服务重启会把未完成请求标为中断，不会自动重试；相同请求编号仅允许重试相同消息，防止重复操作。

连接测试现在使用与助手相同的只读工具参数，并通过合成结果检查工具续接，不读取或修改真实项目。模型未调用工具时明确说明续接尚未验证。DeepSeek Anthropic 地址 `https://api.deepseek.com/anthropic` 可直接填写；空的工具 `required` 字段按 JSON Schema 发送 `[]`。

会话与完整模型上下文位于持久文件目录 `.tcymc-ai/conversations/<用户ID>/`，AES-GCM 加密、目录权限 0700、文件权限 0600。备份时连同 `VIKUNJA_SERVICE_SECRET` 保存。每账户最多 100 个会话、每会话 200 轮，单个加密记录上限 16 MiB；达到限制后新建或删除旧会话。每账户同时运行一个助手请求。切换模型或协议后以纯文字和真实操作记录续接，避免把旧服务商的签名上下文发给另一服务商。会话接口不接受 API Token、公开分享或机器人身份，也不暴露到 MCP。

## 可审核、可继续的 Agent 执行

在助手的“上下文与权限”里选择工作模式和审核策略：

| 策略 | 普通单项修改 | 原子批量修改 | 删除、新建项目、评论、负责人变更 |
| --- | --- | --- | --- |
| 智能审核（默认） | 自动执行 | 展示整批预览 | 展示预览 |
| 逐项审核 | 展示预览 | 展示整批预览 | 展示预览 |
| 自主执行 | 自动执行 | 自动执行 | 展示预览 |

默认仍为只读；删除工具需要另行勾选。审核由服务器控制，不依赖模型自行判断风险。卡片展示真实记录的修改前后值、具体参数和快照；可以批准、拒绝、编辑 JSON 并更新预览。编辑后必须审核新的预览编号。拒绝结果会反馈给模型，模型可继续完成其余部分。`ask_user` 用于真正缺少目标或日期等信息的澄清，支持候选选项与自由回答。

“当前项目”提供上下文；“仅允许修改这些项目”才是硬性写入范围。选定范围后，后端逐次检查目标项目，跨范围修改和新建项目被拒绝。任务详情可通过“交给 AI 助手处理此任务”进入带任务 ID 的会话入口，不自动读取或发送任务正文。

任务修改和删除会在事务内锁定记录，再检查实时权限与审核快照版本。只更新明确指定的字段，保留其余内容；任务状态在审核期间变化会生成新预览。批量修改最多 25 个不同任务，任一项失败整批回滚。返回业务层实际结果，包括重复任务完成时的日期处理；不会把拟修改值当成实际结果。

默认每段允许 **16 轮模型请求、40 次操作、180 秒活动执行时间**；界面可分别配置 1–40 轮、1–100 次、1–600 秒及 token 软上限。批量按任务数计入操作预算，工具发现也计一次。到达预算会保存当前位置，可明确追加一段预算后继续；最多累计 200 轮、1000 次操作。token 仅按服务商报告的用量在请求之间检查，单次请求可能超过软上限。审核等待不占执行时限。

暂停状态、原生模型上下文和每次操作收据均加密保存，审核后可从保存位置继续。刷新或正常审核续接不会重放已完成的工具。服务重启时正在执行的请求标为中断；未确认结果的写入标为未知，必须先核查真实记录。文件收据与数据库提交并非跨系统原子事务，因此不声称崩溃时能够保证恰好执行一次。

工具定义、参数验证、能力发现共用同一份 JSON Schema；日期、范围和未知字段也由服务器校验。模型收到具体错误后可修正参数，权限与范围错误不会获得额外权限。模型理解仍可能出错，任务结果和操作收据才是判断执行情况的依据。

## 报错与调试窗口

入口：**头像菜单 → 报错与调试**，或助手页面顶部同名按钮；错误通知也提供打开入口。每条助手回复的“查看运行诊断”可打开该轮记录。支持 HTTP/代理错误、浏览器错误与助手执行记录，默认只在当前浏览器内存保留最近 30 条，重复请求错误合并计数，刷新、清空或切换账户后移除。保存在会话中的运行记录可重新打开诊断。

报告提供版本、时间、页面路径、HTTP 状态、追踪编号、错误阶段、协议、请求及实际模型、真实端点、token、耗时、首字时间、预算和工具状态。复制和下载 JSON 都会先展示预览，不会自动上传。

默认导出不含对话正文、工具参数或结果。需要定位模型参数等具体问题时，可勾选“附带具体报错、工具参数和结果”，检查预览后再分享。请求头、登录令牌和原始音频不收集；敏感字段、常见密钥格式以及 URL 凭据与查询参数会脱敏。自由文本仍可能含私人内容，分享详细报告前应自行检查。代理返回 HTML 拦截页时展示简明提示，不再把整页 HTML 塞进错误通知。

执行设计参考了 [Home Assistant 的 LLM 工具边界](https://github.com/home-assistant/core/blob/d40f18cc477d3bd0c39dfdec331c0096f7dcdddd/homeassistant/helpers/llm.py)、[n8n 工具审核](https://github.com/n8n-io/n8n/blob/7fc63ed7f7ec9c619825b95e999cf9b968aa4823/packages/cli/src/tool-generation/hitl-tools.ts)、[OpenHands](https://github.com/OpenHands/software-agent-sdk)、[LibreChat](https://github.com/LibreChat-AI/LibreChat)、[CopilotKit](https://github.com/CopilotKit/CopilotKit) 与 [LangGraph](https://github.com/langchain-ai/langgraph) 的能力发现、交互式审核和暂停恢复思路，使用本项目现有 Vue、Go 与权限模型实现，没有引入这些项目的运行服务。

## AI 与语音

登录后进入 **设置 → AI 与语音**，添加连接名称、HTTPS API 基础地址、API 密钥、模型 ID、用途与协议。基础地址包含服务商要求的版本路径，不要填写具体请求端点。例如 OpenAI/Anthropic 通常使用 `/v1`，Gemini 通常使用 `/v1beta`；代理服务以其文档为准。页面会展示完整的模型调用端点和模型列表端点，连接测试成功后也返回服务器实际使用的端点。

三个功能独立分配模型：**语音识别 → 识别文字整理 → 任务 AI 助手**。支持的协议如下：

| 协议 | 可用功能 | 在基础地址后追加的路径 |
| --- | --- | --- |
| OpenAI Chat Completions | 文字整理、任务助手 | `/chat/completions` |
| OpenAI Responses | 文字整理、任务助手 | `/responses` |
| Anthropic Messages | 文字整理、任务助手 | `/messages` |
| Gemini generateContent | 文字整理、任务助手、语音识别 | `/models/{model}:generateContent` |
| OpenAI Audio Transcriptions | 语音识别 | `/audio/transcriptions` |
| OpenAI Chat Audio | 语音识别 | `/chat/completions` |

**获取模型列表**会使用对应协议的鉴权访问上游 `/models`，支持 Anthropic/Gemini 分页（最多 10 页），并按名称去重排序。可以在保存前获取，已保存的同一地址可复用密钥。模型 ID 始终允许手动输入；上游未提供列表或列表获取失败，也能继续配置。列表只表示上游列出的模型，使用语音或任务工具仍需选择支持相应能力的模型。Anthropic Messages 不提供原始音频输入，不能作为语音识别连接；可以处理识别后的文字。

点击保存后可以测试连接。语音测试需上传音频。AI 助手支持浏览器录音（最长 3 分钟）或上传音频（最大 16 MiB），识别后可修改文字，再明确发送执行。OpenAI Chat Audio 需要支持音频输入的模型；WAV/MP3 直接发送，浏览器录音等格式在本机转为 16 kHz 单声道 WAV（转换最长 3 分钟）。Gemini 内嵌音频限 14 MiB，以控制 Base64 后的请求体积。浏览器需要 HTTPS 和麦克风权限。

协议参考：[OpenAI 音频对话](https://developers.openai.com/api/docs/guides/audio-chat-completions)、[Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)、[Gemini 音频输入](https://ai.google.dev/gemini-api/docs/audio)。

Responses 的工具调用与推理上下文、Anthropic 的工具结果、Gemini 的函数调用和 thought signature 都按各自原生结构处理。历史版本的连接会自动按原来的 OpenAI 兼容协议读取。

助手支持项目、任务、绝对提醒、标签、评论、负责人、任务关系与原子批量排期。基础工具始终可用，扩展工具通过 `find_tools` 按需发现、加载；未加载或不在当前读写权限内的工具会被拒绝。所有操作继续调用 Vikunja 原有权限与业务规则。内置助手不管理账户、密钥、分享权限、任意 SQL 或任意外部请求。

密钥仅写入，读取设置只返回是否已配置。模型配置按用户存储在 `files/.tcymc-ai/`，使用服务端 `service.secret` 派生密钥进行 AES-GCM 加密；**备份与恢复必须同时保留 files 和 service.secret**。默认限制模型地址为可公开路由的 HTTPS 服务，沿用上游出站请求 SSRF 防护。开发机如需访问私有模型，应由服务器管理者审查并配置上游 `outgoingrequests` 选项。

AI 收到的是本次对话及工具查询到的任务数据，使用前应选择你信任的模型服务。调用失败可能已有部分操作完成，请先查看执行记录和任务状态。会话请求编号和操作收据持久保存，用于防止相同消息重复提交。旧 `/ai/run` 兼容接口仅提供进程内 10 分钟缓存；新界面使用可保存会话的接口。当前不预置任何真实模型账号或密钥。

上游 MCP 入口仍为 `/api/v2/mcp`。外部 agent 可在 **设置 → MCP** 创建具备所需权限的令牌；自定义 AI 设置和公开主页管理接口只允许本人登录会话使用，不向 MCP 提供。

## 公开主页与忙闲时间

进入 **设置 → 公开主页**，填写地址、标题、简介、可联系星期/时段与展示天数（1–31 天）。默认未发布、没有公开项目。

1. 只添加你愿意公开的项目，设置对外别名。默认显示“忙碌”，不暴露项目和任务原名。
2. 可选择公开任务标题，或完全隐藏项目。预览后可以给单个任务设置别名或完全隐藏。
3. 编辑 Markdown 或静态 HTML 正文。可用 `{{schedule}}`、`{{availability}}`、`{{projects}}` 插入经过发布规则处理的内容。
4. 可勾选完全自定义正文，隐藏默认日程面板。HTML 使用隔离 iframe，可内联 CSS；脚本、表单和访问主应用的能力不可用。
5. 点击 **预览公开效果**；修改内容后必须重新预览，才能点击 **发布当前预览**。

网页入口：`https://你的域名/p/页面地址`。机器人入口：`GET https://你的域名/api/v2/public/页面地址`，无需登录，返回 `title`、`intro`、`content`、`format`、`projects`、`events`、`free`、时间范围与生成时间。

机器人请求示例：`curl -A "VikunjaX-ScheduleClient/1.0" https://你的域名/api/v2/public/页面地址`。若部署在 Cloudflare 后面，现有防护规则可能拦截 Python 默认 User-Agent；为客户端设置明确的名称，并根据自己的规则配置 API 访问。

公开 JSON 使用与网页相同的披露规则，不含内部 ID、任务描述、成员、原始名称或私有编辑提示。自定义正文是你主动发布的内容，其中写入的信息也会公开。隐藏默认面板只改变页面排版，不改变 JSON 的公开范围。

**保存草稿不会修改已发布页面。** 发布后，日程按照上一次发布的规则随任务实时更新；页面每分钟刷新，接口每次请求重新计算。撤下页面会同时撤下 JSON。项目访问权限失效时页面停止返回日程。当前每个账号有一份公开主页，支持独立地址、滚动展示窗口与任意静态正文。

忙闲计算使用 **Asia/Shanghai**：有完整开始/结束时间的未完成任务形成忙碌时间段；仅有截止时间的任务作为截止事项展示，不占用整天。重叠时间段合并后从可联系窗口中扣除。隐藏或未选择的项目/任务不参与计算，因此这里的“可联系时间”仅代表已公开安排，不是完整私人日历或预约保证。用户可把敏感安排设为“忙碌”保留占用时间，避免暴露原名。

## 中英文、移动端与更新提示

简体中文与英文的前后端翻译键保持一致；新增页面、错误提示、无障碍标签与更新通知均可随界面语言切换。本地检查缺失条目和占位参数。快速添加帮助保留可识别的英文日期指令，并提供中文解释，不会把不支持的中文指令当成示例。

手机布局支持侧边导航、横向滑动的设置导航、单列表单、长端点换行、AI 操作按钮与公开页面。自动化浏览器测试覆盖 360px、390px 和桌面视口，以及主界面、项目列表、任务详情、AI 设置/助手、公开页面和更新提示。

底部更新提示来自 **Service Worker 检测到已下载的新前端资源**，不代表上游官方发布了新版。仅在实际查询到等待启用的构建版本、且与当前页面版本不同（对于 tcymc 正式版本还必须更新）时提示。相同版本、已知的旧版本、版本查询超时或失败都不提示，也不使用服务器版本代填。异步查询的过期结果不会覆盖最新判断。提示显示待启用的 `v2.7.1-tcymc.*` 构建版本和当前版本；点击刷新后启用新资源。不查询上游发布列表，也不会自动替换服务器 Docker 镜像。从旧版升级时，第一次刷新可能仍看到旧版提示，启用新资源后即使用新的提示。

## 发布方式：仅本机编译

本仓库不使用 GitHub Actions。推送代码、创建标签或发布 Release 都不应运行 GitHub 自动工作流；合并上游代码时也不保留其工作流文件。

检查、测试、前后端编译与 Docker 镜像构建都在自己的机器上完成，验证通过后再手动上传二进制、镜像包、源码包与校验文件到 GitHub Release。本地翻译覆盖检查命令为：

```sh
cd frontend
pnpm vitest run src/i18n/coverage.test.ts src/helpers/tcyAudio.test.ts
```

## 构建与 Docker 部署

```sh
git clone https://github.com/KanameMadoka520/vikunja-x.git
cd vikunja-x
docker build -f Dockerfile.tcymc --build-arg RELEASE_VERSION=v2.7.1-tcymc.5 -t vikunja-x:v2.7.1-tcymc.5 .
```

`Dockerfile.tcymc` 固定基础镜像摘要，使用锁定依赖构建前端，并生成带 SQLite 支持的静态 Go 二进制，最终以 UID 1000 在最小镜像中运行。提供 CA 和时区数据。数据库支持沿用上游，包括 PostgreSQL。

最小运行示例（生产可按上游文档接入 PostgreSQL）：

```sh
mkdir -p data/files data/db
sudo chown -R 1000:1000 data
docker run -d --name vikunja-x --restart unless-stopped \
  -p 127.0.0.1:3456:3456 \
  -v "$PWD/data/files:/app/vikunja/files" \
  -v "$PWD/data/db:/db" \
  -e VIKUNJA_SERVICE_PUBLICURL=https://task.example.com/ \
  -e VIKUNJA_SERVICE_SECRET=替换为随机且持久保存的长密钥 \
  -e VIKUNJA_SERVICE_ENABLEREGISTRATION=false \
  -e VIKUNJA_SERVICE_TIMEZONE=Asia/Shanghai \
  vikunja-x:v2.7.1-tcymc.5
```

通过反向代理提供 HTTPS。创建首个账号使用 `docker exec -it vikunja-x /app/vikunja/vikunja user create --help` 查看 CLI 参数。注册默认建议关闭；SMTP 按上游 `VIKUNJA_MAILER_*` 配置，密码通过外部环境文件提供，勿提交源码。账号名中的 admin 不会绕过上游授权功能。

Release 附带 Linux amd64 二进制、Docker 镜像包及 SHA256 校验文件；使用 `docker load -i vikunja-x-v2.7.1-tcymc.5-linux-amd64.docker.tar.gz` 导入镜像。

## 本地开发与验证

需要 Go 1.27、Node.js 24、pnpm 11.27、Mage；依赖版本以 `go.mod`、`frontend/package.json` 和锁文件为准。

```sh
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm build
cd ..
go install github.com/magefile/mage@latest
mage build
mage test:filter TestTCY
mage test:e2e 'tests/e2e/user/settings/tcy-'
```

前后端开发约定见 [AGENTS.md](AGENTS.md)。新增接口位于 API v2，客户端通过 `mage generate:frontend-client` 自动生成。开发中可分别运行 API 与 `frontend` 的 `pnpm dev`。

提交作者使用 `KanameMadoka520 <90090108+KanameMadoka520@users.noreply.github.com>`，无需公开私人邮箱。本仓库不包含生产环境密码、SMTP 密码、模型密钥或 GitHub 访问令牌。
