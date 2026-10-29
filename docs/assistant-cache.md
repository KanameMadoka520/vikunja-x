# 阿罗娜：缓存与工具上下文设计

## 问题与证据

旧版在每条用户消息开始时，把秒级时间、项目与权限写入系统提示词前部，并重置动态工具集合。发现扩展工具后改写顶层 `tools`。同一组工具保持不变时，实际连接可报告约 99% 缓存命中；加入新工具时会降到很低。任务列表与批量写入又返回完整对象，把无关描述、附件和元数据重复带入长对话。

## 采用的设计

- 系统提示词只保留稳定规则和人设/语言。动态 `execution_context` 作为服务器生成的用户角色消息跟在历史后面；保存在本轮上下文中，后续原样复用。权限始终由执行层校验，模型看到的上下文不是权限授予。
- 顶层固定为 `list_projects`、`list_tasks`、`get_task`、`find_tools`、`ask_user`、`web_search`、`invoke_tool`。搜索关闭时执行层拒绝搜索，强制搜索时仍校验首轮搜索行为；入口声明不随开关变动。
- `find_tools` 返回当前允许能力的完整 JSON Schema，作为追加的工具结果留在历史中。`invoke_tool(name, arguments)` 解包后进入原工具校验、范围、审核、预算、原子事务及审计路径。此入口不提供任意代码、SQL 或 HTTP 执行。
- 新一轮只复用仍在历史中且与当前注册合同完全相同的发现结果。压缩删掉定义后重新发现；只读模式和删除权限变化仍以最新配置为准。旧的持久运行状态默认沿用旧传输，恢复时保持原始工具调用及原始协议签名。
- 模型侧列表结果保留摘要与分页，写入结果保留实际变更字段。完整结果仍保存在 Action 审计记录中。只精简新追加的结果，不因下一轮变化而重写既有历史；`get_task`/`get_project` 提供完整详情。
- 不设置更小的模型输出上限，不删除用户会话，不自动反复压缩。压缩会改变部分前缀，应结合上下文容量和任务阶段使用。

## 统计口径

逐次请求使用上游报告的缓存 token。汇总为 `Σ缓存读取 / Σ可统计输入`，只统计确实报告缓存用量的请求，不平均各轮百分比。缺失报告显示未知及覆盖请求数。输入未从缓存读取的部分可能包含缓存写入，不能直接当作全价账单。字符数、JSON 字节数不是模型 token。

支持 Anthropic 缓存读取/创建字段、OpenAI Chat/Responses 缓存详情、DeepSeek 顶层命中字段，以及 Gemini 缓存计数。兼容接口若同时返回两套同义总量字段，只选一套，避免重复计数。新增模型接口应以真实返回格式测试。

## 验证与边界

本机以当前 DeepSeek 连接、约 4 万 token 的既有历史进行隔离验证。任务执行器仅接受内存样例 900001，未连接生产任务写入接口。第一轮发现工具后，下一次请求报告 40,576 / 41,329（约 98.2%）缓存读取；随后一条新消息直接复用参数定义，两次请求共报告 82,944 / 83,337（约 99.5%）缓存读取，非缓存读取输入 393。首次新前缀请求为冷缓存。

这是同一连接上的实测样例，不承诺所有任务或服务商达到相同比例。缓存过期、路由/模型切换、人设/语言或工具合同变化、压缩及上游缓存策略都会影响结果。没有向兼容网关盲目发送服务商专有缓存参数，也不使用后台保温请求制造命中。

回归覆盖四种协议的工具发现及扩展调用、参数和权限拒绝、审核编辑后执行、原子批量事务、失败恢复、历史定义复用、稳定前缀、结果摘要，以及桌面和手机上的加权统计/缺失数据展示。

## 参考

- [OpenAI：Prompt Caching 201 / Codex 经验](https://developers.openai.com/cookbook/examples/prompt_caching_201)：稳定系统/工具前缀，运行时配置采用追加更新。
- [OpenAI：Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)：前缀匹配、工具变更和压缩对缓存的影响。
- [Anthropic：Advanced tool use](https://www.anthropic.com/research/advanced-tool-use)：按需工具发现，参数随发现结果进入上下文，减少无关中间结果。
- [Claude Code：Manage costs](https://code.claude.com/docs/en/costs)：缓存统计、工具开销和长会话管理。
- [DeepSeek Harness：System prompt](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/system-prompt/README.md)：稳定顺序与动态上下文分离，记录工具和提示词对缓存的影响。
- [DeepSeek：Context caching](https://api-docs.deepseek.com/guides/kv_cache/)：已持久化前缀匹配及尽力而为的缓存机制。

这里采用跨协议的本地发现/调用入口，没有假装兼容网关原生支持 OpenAI 或 Anthropic 专用的延迟工具加载字段。
