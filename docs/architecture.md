# 后端权威架构与接口草案

当前账号、会话、测试初始化、快照，以及测试旅行 start/claim、扣物品账本、奖励和收藏已实现，见 [API](backend-api.md) 与 [旅行验收记录](travel-backend.md)。Jev 真实猫自主生活已实现，见 [行为与验证](cat-life.md)。正式自主出发、商店与聊天叙事仍为后续设计；下文建议模型不等于已全部实装。

## 技术边界

React Native 负责应用页面、导航、账号会话、网络与待确认操作持久化；嵌入式 LibGodot 4.5.1 负责 2D 场景、完整 Sprite 动画、寻路和宠物互动。JSON 是房间布局唯一来源。RN 通过少量状态/场景命令和事件与 Godot 通信，不跨桥逐帧驱动动画。独立 Godot 4.7.2 客户端和 React/PixiJS 历史预览保留为对照。当前移动端的构建和验收见 [RN 迁移记录](rn-migration.md)。Node/NestJS 提供 HTTPS API；PostgreSQL + Prisma 保存权威状态。共享 contracts 只表达协议；game-core 仅放显式输入、确定性纯逻辑与公共配置类型。客户端包中不放奖励随机种子、AI 凭据、管理接口或数据库访问。

Redis/队列不是 MVP 的必需条件。旅程到期通过数据库时间与查询/领取时的惰性判定完成，不依赖常驻定时器；后续队列可处理推送和 AI 叙事，但必须允许重试且不能直接重复发奖。

自主出发：正式产品由服务器依据已保存行囊、宠物性格和版本化配置决定出发窗口与目的地。可由调度器触发或读取时惰性推进，但必须复用同一出发事务和幂等约束。已实现的 `POST /v1/me/trips` 是首个垂直切片/调试入口；正式版本还需要保存行囊与自主调度，未作为当前家园的玩家操作。AI 不能直接启动未验证的旅程。

## 后续玩法数据模型建议（当前基础能力见 backend-api.md）

- Player：身份、revision、创建时间；会话身份是所有权校验来源。
- Pet：playerId、speciesId、personalityVersion、nickname、activeTripId；首期 1 宠，结构支持多宠。
- SpeciesConfig / ItemConfig / DestinationConfig：稳定 ID、版本、展示资源和规则；旅行保存使用时的版本。
- Inventory：playerId + itemId 唯一，quantity 非负；货币统一入账本或明确单独钱包字段。
- Trip：playerId、petId、状态、startedAt、returnAt、configVersion、已冻结奖励/事件、claimedAt。
- RewardLedger：tripId 唯一、playerId、不可变奖励明细；经济变动另外记录原因与关联交易。
- Collection：playerId + collectibleId 唯一，首次获得与重复数量。
- IdempotencyRecord：playerId + operation + key 唯一、requestHash、响应快照、状态、创建时间。
- Outbox：事务内记录待推送/叙事事件，由可重试消费者处理；按 eventId 去重。
- AI 相关记忆/叙事模型：等 AI 实施顺序与供应商、隐私和保留期确认后再设计，不预建真实数据收集。

## 当前关键事务

出发：认证及运行时输入校验 → 锁 Account 行 → 事务内复核会话与幂等记录 → 检查无未领取旅程及 expectedRevision → 有条件扣库存 → 用数据库时间确定 startedAt/returnAt → 服务端产生并冻结奖励 → 创建旅程与 DEPARTURE 账本 → revision +1 → 保存响应 → 同一事务提交。

领取：认证及输入校验 → 锁 Account 行 → 事务内复核会话与幂等记录 → 按账号归属查询旅程 → 若已领取返回原结算 → 检查数据库 clock_timestamp() ≥ returnAt → 按固化奖励更新库存/收藏 → 插入 CLAIM 账本 → revision +1 → 固化 claimedAt 和响应 → 同一事务提交。当前未引入 Outbox 或 AI 叙事写入。

当前一账号一玩家一宠物，所有存档写路径共用 Account 行锁；同账号写事务串行，多账号互不占用此锁。出发行囊按 itemId 排序扣除。持久约束兜底：TripLedger 的 tripId+kind 唯一、库存非负、每玩家仅一个未领取旅程（SQL 部分唯一索引）。同幂等键不同 requestHash 返回 409；网络超时后必须保留原键重试，不能推断为未提交。当前没有清理幂等记录；新增保留期或多宠/交易路径时，需重新评估重试窗口与统一锁序。

## 协议草案

| 请求 | 作用 | 关键限制 |
|---|---|---|
| GET /v1/health | 进程存活 | 已存在；不表示数据库就绪 |
| GET /v1/me/snapshot | 宠物/背包/当前旅行/收藏摘要 | 认证；serverNow + revision + 配置版本 |
| POST /v1/me/trips | 已实现测试出发 | Idempotency-Key，expectedRevision，loadoutItemIds |
| GET /v1/me/trips/:id | 后续旅行详情建议 | 当前通过快照查看活动旅程；未实现此独立接口 |
| POST /v1/me/trips/:id/claim | 已实现测试领取 | 幂等、账本唯一、服务端到期校验 |
| GET /v1/collection | 收藏分页 | 所有权过滤、稳定分页 |
| POST /v1/shop/purchases | 购买道具 | 服务端查价格/库存、同事务扣款、幂等 |

当前出发/领取已有运行时校验与数据库/HTTP 测试；错误码和正式可调用路径以 backend-api.md 为准。独立旅行详情、收藏分页、商店与 OpenAPI 产物尚未实现；收藏目前随权威快照返回。

## 缓存、时间与安全

客户端显示倒计时采用 serverNow/returnAt 与单调计时推算，重新进入前台即刷新；时间偏差不用于领奖。缓存附带 playerId、revision、cachedAt，切账号清理；离线只读，写操作等待连接且由用户明确重试。网络超时后保留同一幂等键，不能每次重试生成新键。收到旧 revision 快照不能覆盖新快照。

全程 HTTPS；服务端对输入长度、数量、ID、配置版本做白名单验证；资源所有权在数据库查询条件中约束；短时令牌与刷新策略另行确定。CORS 不是认证。生产配置缺失即启动失败；健康与数据库 readiness 分离。日志脱敏、不记录聊天正文/凭据，经济账本可审计。备份必须测试恢复，配置变更不能改写历史旅程。

## AI 与经济解耦

确定性权威路径先完成结算；实现 AI 时，Outbox 只携带生成所需的最小事件事实。生成结果写入单独叙事状态，失败显示模板并可重试，不回滚已发奖励。服务商、地区、预算与传输数据确认前不接入模型。模型输出不能被当作服务器指令或有效配置。

## Godot 迁移决定（2026-10-17）

见 [迁移记录](godot-migration.md)、[开发说明](godot-development.md) 与 docs/adr 两项决定。家园生活动作仅是本地表现，穿门只切换房间。账号与经济继续经原有认证 API；不在 Godot 实现奖励抽取或库存权威副本。
