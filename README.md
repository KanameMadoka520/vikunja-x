# Vikunja X · tcymc二次开发版

基于 [Vikunja 官方 v2.7.1](https://github.com/go-vikunja/vikunja/releases/tag/v2.7.1) 的个人任务管理扩展，由 **KanameMadoka520** 维护。保留上游项目、任务、甘特图、看板、提醒、CalDAV 和 MCP，增加可配置模型的 AI 助手、语音输入和独立公开主页。

- 源码与问题反馈：[KanameMadoka520/vikunja-x](https://github.com/KanameMadoka520/vikunja-x)
- 版本：`v2.7.1-tcymc.2`
- 许可证：AGPL-3.0-or-later；上游版权和许可证继续适用，参见 [LICENSE](LICENSE) 与 [上游 README](README.upstream.md)。本项目是独立二次开发版。

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

助手可查询项目与任务、读取任务、创建项目和任务、修改标题/描述/开始时间/结束时间/截止时间/优先级/完成状态。工作方式可选“直接执行”或“只读”，删除任务需另外勾选当次允许。每次最多 8 轮推理、20 次工具操作，并显示真实执行记录。所有工具操作继续经过 Vikunja 原有权限校验。内置助手不管理账户、密钥、分享权限或任意外部请求。

密钥仅写入，读取设置只返回是否已配置。模型配置按用户存储在 `files/.tcymc-ai/`，使用服务端 `service.secret` 派生密钥进行 AES-GCM 加密；**备份与恢复必须同时保留 files 和 service.secret**。默认限制模型地址为可公开路由的 HTTPS 服务，沿用上游出站请求 SSRF 防护。开发机如需访问私有模型，应由服务器管理者审查并配置上游 `outgoingrequests` 选项。

AI 收到的是本次对话及工具查询到的任务数据，使用前应选择你信任的模型服务。调用失败可能已有部分操作完成，请先查看执行记录和任务状态。相同请求 ID 在当前进程内缓存 10 分钟，用于避免重复提交；这不是跨重启的持久事务。当前不预置任何真实模型账号或密钥。

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

底部更新提示来自 **Service Worker 检测到已下载的新前端资源**，不代表上游官方发布了新版。提示显示等待启用的 `v2.7.1-tcymc.*` 构建版本和当前版本；点击刷新后启用新资源。不查询上游发布列表，也不会自动替换服务器 Docker 镜像。从旧版升级时，第一次刷新可能仍看到旧版提示，启用新资源后即使用新的提示。

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
docker build -f Dockerfile.tcymc --build-arg RELEASE_VERSION=v2.7.1-tcymc.2 -t vikunja-x:v2.7.1-tcymc.2 .
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
  vikunja-x:v2.7.1-tcymc.2
```

通过反向代理提供 HTTPS。创建首个账号使用 `docker exec -it vikunja-x /app/vikunja/vikunja user create --help` 查看 CLI 参数。注册默认建议关闭；SMTP 按上游 `VIKUNJA_MAILER_*` 配置，密码通过外部环境文件提供，勿提交源码。账号名中的 admin 不会绕过上游授权功能。

Release 附带 Linux amd64 二进制、Docker 镜像包及 SHA256 校验文件；使用 `docker load -i vikunja-x-v2.7.1-tcymc.2-linux-amd64.docker.tar.gz` 导入镜像。

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
