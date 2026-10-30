# 服务端旅行验收切片

2026-10-17。当前实现计划中的调试 start/claim 闭环：测试行囊 → 扣物品 → 旅行 → 到期 → 原子领取与收藏。客户端仍为独立水彩互动预览，未接账号经济。正式“保存行囊后由宠物自主出发”的调度和 UI 不在本切片内，不能把此调试入口当作已完成的正式自主旅行。

## 当前规则

规则只在 `apps/server/src/travel.ts`：版本 `test-trip-v1`，目的地 `test_forest`，时长 60 秒；允许 `test_food`、`test_supply`，每个选中的道具消耗 1 件。请求允许 1–3 个不同 ID；目前只有两个测试 ID，因此最多能选择两种。它们不映射便当、水壶等已选美术，也不覆盖 AI 宠物动作包。

出发时由服务器随机选定三种测试明信片之一，并固化奖励：1 个 test_food 和 1 张明信片。每条奖励同时固化 collectible 标记，领取时依据已存数据更新收藏，不依赖当前配置重新判定、重抽或改奖。基础快照的 configVersion 仍表示 starter-v1，旅程有自己的 configVersion。

## 接口

前缀 `/v1`，两条写接口均需 Bearer 认证、JSON 和 `Idempotency-Key`。完整规则见 [backend-api.md](backend-api.md)。

| 接口 | 请求 | 返回 |
|---|---|---|
| POST /me/trips | `{"loadoutItemIds":["test_food"],"expectedRevision":1}` | 201 `{trip,snapshot}` |
| GET /me/snapshot | 无 body | 当前旅行、背包、收藏、revision、serverNow |
| POST /me/trips/:id/claim | `{}` | 200 `{tripId,ledgerEntryId,rewards,snapshot}` |

调用顺序：注册/登录 → 以独立幂等键初始化 → 读取快照 revision → 出发 → 按 serverNow/returnAt 展示等待 → 到期后领取 → 重新读取快照。服务端没有客户端时间覆盖、指定奖励、指定玩家或提前结束入口。测试通过直接修改隔离数据库中的专属旅程来缩短等待，应用 API 没有此功能。

同键同请求返回首次提交的状态码与完整响应；同键不同参数返回 409 IDEMPOTENCY_CONFLICT。出发行囊按集合排序后计算请求摘要，因此只改变道具排列顺序仍视为同请求。失败事务不占用该键，可以修复库存或等到归来后用同键重试。

领取使用其他键重试，也返回首次领取的冻结回执，不再次增加奖励。**回执里的快照是历史状态**：如果已经开始下一段旅行，旧回执仍保持原 revision；当前状态必须通过 GET /me/snapshot 获取，客户端不能用旧回执覆盖更新的 revision。基础版本已存的 initialize 回执可能没有 collection 字段；公开类型允许该字段缺失，新的 GET 快照始终包含它。

## 事务和状态

所有经济写入先锁 Account 行，再在事务内复核会话、检查幂等记录。当前一账号一玩家一宠物，因此同账号出发、领取、初始化、改密和退出使用同一把数据库行锁；不需要新增 Redis 锁或后台队列。其他账号互不占用此锁。库存按规范化 itemId 顺序扣除，同时使用 quantity ≥ 1 的条件更新。

- 出发：验证 revision、没有未领取旅程、库存充足 → 扣物品 → 固化时间/配置/奖励 → 写 DEPARTURE 账本 → revision +1 → 幂等回执，一起提交。
- 到期：GET 只根据数据库时间推导 READY_TO_CLAIM，不发奖、不增加 revision；宠物表现为 AT_HOME，但领取前仍不能再次出发。
- 领取：验证归属及数据库时间 → 用存储的奖励更新库存/收藏 → 写 CLAIM 账本 → revision +1 → 固化领取回执及 claimedAt，一起提交。

数据库时间使用 clock_timestamp()，避免排队等待行锁后仍使用事务开始时刻。设备时间和进程 Date.now 都不是经济判据。TripView 不暴露未领取的奖励或服务端抽取细节。

数据库兜底：Trip 的 playerId 上有 claimedAt IS NULL 的部分唯一索引；TripLedger 的 tripId+kind 唯一；库存非负、收藏数量为正；归来时间晚于出发时间，claimedAt 和 claimResponse 同时存在或同时为空。行锁与事务决定正常路径，唯一约束防止绕过服务层的重复写入。

## 迁移与回退

新增迁移 `202610170002_trip_loop` 只创建 Trip / TripLedger / CollectionEntry、枚举、索引和约束，不回填或删除原账号、宠物、库存与旧回执。已执行的 foundation 迁移保持原样。Prisma schema 无法声明此版本的部分唯一索引，后续生成迁移时需保留该自定义 SQL 约束。

readiness 同时要求两条迁移成功；缺失或未完成则 503。部署时由迁移拥有者执行 `db:deploy`，再按 `ops/grant-runtime.sql` 给运行角色授权。TripLedger 只授 SELECT/INSERT，不授 UPDATE/DELETE。不要让运行角色取得建表权限。

本轮只在新建、仅监听 loopback 的临时 PostgreSQL 集群执行迁移和测试，没有修改阿里云配置、远端库、服务或部署链接。远端上线仍需既定备份与恢复流程。应用回退可以切回旧 release，新表与账本保留；不提供会删除已发生旅程的 down SQL。如需改变表结构，另写向前迁移。

## 验收记录

执行环境：Node 24.14.1；本地 PostgreSQL 14.18；独立 `wanpet_test_trip`，连接池 5。它不是阿里云 PostgreSQL 17 的部署或性能证明。测试账户使用每次唯一名称，未清空任何既有业务表。验收后已停止并清理本轮临时集群与测试凭据。

通过：

- scaffold、Prisma generate/validate、全仓 typecheck、完整 build。
- 12 项客户端单元测试、7 项服务端单元测试。
- 基础账号与旅行两组数据库/HTTP 验收：24 个子场景（Node runner 连同两个顶层测试合计 26 项）。
- 100 次并发初始化只发一次；100 次并发出发只产生一段旅程和一笔扣除账本；100 次并发领取只产生一笔奖励与一次收藏更新。
- 同键改参数拒绝、异键领取去重、旧回执不改写新旅程、旧初始化回执兼容、进程重启恢复、跨账号拒绝、提前领取拒绝、Date.now 前后改 7 天不影响判定。
- 出发账本故障与领取最终发布故障注入，验证库存、收藏、旅程、账本、revision、幂等记录完整回滚；移除测试触发器后可重试。
- 数据库拒绝第二段未领取旅程、重复领奖账本、不一致领取状态、非正收藏数量。

测试文件：[travel.integration.test.ts](../apps/server/test/travel.integration.test.ts)、[integration.test.ts](../apps/server/test/integration.test.ts)、[unit.test.ts](../apps/server/test/unit.test.ts)。只对专属测试库执行 `npm run db:deploy` 与 `npm run test:integration`；测试拒绝非 wanpet_test 或 wanpet_test_后缀的数据库名。两个验收文件串行执行，故障触发器在 finally 中移除。

未运行：阿里云迁移/部署、PostgreSQL 17 实测、生产体量迁移、运行角色端到端权限烟测、浏览器真实旅行流程、iOS 真机、GitHub CI。无失败检查遗留；早期 JSON 类型检查错误已修复后重跑通过。

设计核对：[Prisma 6 事务文档](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)、[PostgreSQL 部分唯一索引](https://www.postgresql.org/docs/15/indexes-partial.html)。实际兼容性以本地锁定的 Prisma 6.19.3 和上述数据库测试为准。
