# 项目年度回顾 / Project year in review

入口：左侧“项目年度回顾”、项目菜单中的同名入口。路径 `/projects/history`。

这里按**整个项目**的完成和归档事件绘制年度日历，不是任务完成统计。

- 项目管理员可以在项目菜单中“标记项目已完成”或“重新打开项目”。完成不会修改任务、子项目、归档状态或写权限。普通成员只能查看其可访问项目的历史。
- 完成和归档分别操作。归档沿用 Vikunja 原有规则：收起日常导航、设为只读，并影响子项目；父项目导致的子项目归档/取消归档也留记录。
- 完成、重新打开、归档、取消归档均保留历史。重复提交同一完成状态不生成重复事件。删除项目会清理对应历史。
- 桌面显示全年方格，手机显示按月日历。选择年份、项目、事件类型、日期或搜索项目名称；下方每页最多 24 条。筛选条件保存在 URL，返回页面可继续查看。
- 日历按账户时区划分年份和日期，使用实际服务器记录时间。创建至事件时间是**记录跨度**，不能解释为实际工时或计划排期。
- 升级前已归档的项目原本没有归档时间，迁移时建立“日期未知”记录，不用更新时间或升级时间伪造历史。过去未记录的完成/恢复行为无法还原。
- 每次完成后重新打开仍能看到过去记录；标题、当前状态、可见权限随当前项目变化。删除或失去访问权限的项目不再出现在回顾中。

## API / implementation

- `GET /api/v2/projects/history?year=2026&timezone=Asia/Shanghai`: lightweight per-day counts and paginated event records. Optional `project`, `kind` (`milestones`, `all`, `completed`, `archived`, `reopened`, `unarchived`), `day`, `unknown`, `q`, `page`.
- `POST /api/v2/projects/{project}/completion`, body `{"completed":true}`: project-admin-only, transactional and idempotent. Read-only `is_completed` / `completed_at` fields are returned by project reads; generic project writes cannot set them.
- `pkg/models/project_history.go` owns authorization and calendar calculations. The query applies the same inherited/team/link-share access scope before statistics, search and pagination, and includes archived projects.
- `project_lifecycle_events` stores server timestamps and event kinds. Year statistics stream timestamps and project IDs only; the browser receives at most one year of day counts and one page of lightweight rows, without task bodies.
- Migration `20261031032235` uses `partialSync` for existing project columns and adds the new event table. Legacy archived projects get an undated event. No project, task or original index is deleted.

The overview describes project milestones, not an immutable title/audit snapshot and not a time-tracking report.
