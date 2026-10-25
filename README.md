# Vikunja X · tcymc二次开发版

基于 [Vikunja 官方 v2.7.1](https://github.com/go-vikunja/vikunja/releases/tag/v2.7.1) 的个人任务管理扩展，由 **KanameMadoka520** 维护。保留上游项目、任务、甘特图、看板、提醒、CalDAV 和 MCP，增加可配置模型的 AI 助手、语音输入和独立公开主页。

- 源码与问题反馈：[KanameMadoka520/vikunja-x](https://github.com/KanameMadoka520/vikunja-x)
- 版本：`v2.7.1-tcymc.1`
- 许可证：AGPL-3.0-or-later；上游版权和许可证继续适用，参见 [LICENSE](LICENSE) 与 [上游 README](README.upstream.md)。本项目是独立二次开发版。

## AI 与语音

登录后进入 **设置 → AI 与语音**，添加连接名称、HTTPS API 基础地址、API Key、模型 ID 与类型。API 地址填写到 `/v1` 或服务商要求的基础路径，不要填写具体的 `/chat/completions`。

三个功能分别选择连接，可以使用同一服务商的不同模型，也可以跨服务商：

| 功能 | 协议与要求 |
| --- | --- |
| 语音识别 | OpenAI 兼容 `POST /audio/transcriptions`，multipart 音频上传，JSON `text` 响应 |
| 识别文字整理 | OpenAI 兼容 `POST /chat/completions`，可选；只整理口语，失败保留原文 |
| 任务 AI 助手 | OpenAI 兼容 `POST /chat/completions`，需要模型支持 `tools` 工具调用 |

点击保存后可以测试连接。语音模型测试需上传一段音频。AI 助手支持浏览器录音（最长 3 分钟）或上传音频（最大 16 MiB），识别后可修改文字，再明确发送执行。浏览器需要 HTTPS 和麦克风权限。

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

公开 JSON 使用与网页相同的披露规则，不含内部 ID、任务描述、成员、原始名称或私有编辑提示。自定义正文是你主动发布的内容，其中写入的信息也会公开。隐藏默认面板只改变页面排版，不改变 JSON 的公开范围。

**保存草稿不会修改已发布页面。** 发布后，日程按照上一次发布的规则随任务实时更新；页面每分钟刷新，接口每次请求重新计算。撤下页面会同时撤下 JSON。项目访问权限失效时页面停止返回日程。当前每个账号有一份公开主页，支持独立地址、滚动展示窗口与任意静态正文。

忙闲计算使用 **Asia/Shanghai**：有完整开始/结束时间的未完成任务形成忙碌时间段；仅有截止时间的任务作为截止事项展示，不占用整天。重叠时间段合并后从可联系窗口中扣除。隐藏或未选择的项目/任务不参与计算，因此这里的“可联系时间”仅代表已公开安排，不是完整私人日历或预约保证。用户可把敏感安排设为“忙碌”保留占用时间，避免暴露原名。

## 构建与 Docker 部署

```sh
git clone https://github.com/KanameMadoka520/vikunja-x.git
cd vikunja-x
docker build -f Dockerfile.tcymc --build-arg RELEASE_VERSION=v2.7.1-tcymc.1 -t vikunja-x:v2.7.1-tcymc.1 .
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
  vikunja-x:v2.7.1-tcymc.1
```

通过反向代理提供 HTTPS。创建首个账号使用 `docker exec -it vikunja-x /app/vikunja/vikunja user create --help` 查看 CLI 参数。注册默认建议关闭；SMTP 按上游 `VIKUNJA_MAILER_*` 配置，密码通过外部环境文件提供，勿提交源码。账号名中的 admin 不会绕过上游授权功能。

Release 附带 Linux amd64 二进制、Docker 镜像包及 SHA256 校验文件；使用 `docker load -i vikunja-x-v2.7.1-tcymc.1-linux-amd64.docker.tar.gz` 导入镜像。

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
