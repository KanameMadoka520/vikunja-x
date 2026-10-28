# 阿罗娜联网搜索

在“设置 → AI 与语音 → 模型连接 → 联网搜索”选择协议。聊天协议与搜索协议独立；不会根据模型名自动猜测支持情况。默认关闭。可填写搜索模型名与基础地址，留空沿用连接值；官方 DeepSeek 自动使用 `https://api.deepseek.com/v1`，与 `/anthropic` 聊天入口无关。因为复用同一密钥，搜索基础地址必须与聊天地址同源（HTTPS、域名、端口相同）；不同服务请另建模型连接。

| 适配器 | 请求 | 证据 |
| --- | --- | --- |
| DeepSeek Search API | `POST {base}/tools/search` | 原生 `results` 数组，允许真实空结果 |
| OpenAI Responses | `POST {base}/responses`，`tools: [{type: web_search}]` | 搜索调用完成、原生引用／来源 |
| OpenAI Chat | `POST {base}/chat/completions`，`web_search_options` | 原生 URL 引用；需要上游支持搜索的模型 |
| Anthropic | `POST {base}/messages`，`web_search_20250305` | 原生搜索结果或引用；服务端搜索错误不会算成功 |
| Gemini | `generateContent` 或 `streamGenerateContent`，`google_search` | grounding 来源；保留 Google Search attribution |

点击“测试联网搜索”使用当前表单和公开的 Vikunja 文档查询，不保存设置，不修改项目。HTTP 200、正文里的网址或模型声称已搜索都不足以证明搜索成功。测试可能产生上游搜索／token 费用。转发站是否实现该协议、账号是否开通能力，以实际测试为准。

输入区的搜索方式作用于下一次发送：自动判断由模型决定；本轮不搜索从当前工具目录移除 web_search；本轮搜索使用供应商的强制函数调用选择，要求先尝试 web_search。上游若忽略强制选择或配置未开启，会明确报错。开始执行后该轮保持其配置；保存模型设置用于后续轮次。

只将公开检索词发送到搜索接口，不发送完整会话、附件或任务记录。返回文本作为不可信外部数据处理。搜索不会授予写入权限。搜索模型输出 token 采用连接配置／已有容量解析，不另设较低隐藏上限；检索词的 128 字符限制来自 DeepSeek Search API。JSON Search 本身不报告 LLM token，用量未知不会显示为零成本。

实现集中在 `pkg/modules/tcyai/search.go`；`runtime.go` 提供受权限和轮次策略约束的工具执行；`WebSearchEvidence.vue` 展示原生来源与遥测。发送给主模型的工具结果仅含检索词、摘要和来源，诊断和重复模型输出不再塞入上下文。原始会话导出中的操作记录保留搜索证据。

官方协议参考（核对日期 2026-10-29）：

- [DeepSeek Search & Fetch](https://api-docs.deepseek.com/guides/search/)
- [DeepSeek Search API](https://api-docs.deepseek.com/api/search/)
- [OpenAI Web search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Anthropic Web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
- [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search)
