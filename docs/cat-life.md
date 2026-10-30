# 宠物的生活、画像和照顾

更新于 2026-10-29。产品方向已扩展为能聊天、保留自己的资料、吃喝、如厕、阅读和自由活动的 AI 宠物。下面记录当前实现；完整重构方案及尚未完成的部分见 [本轮实现说明](refactor-2026-10-29/04-implementation.md)。

## 一份真实状态，几个不同入口

每个现有宠物 ID 对应一份画像：昵称、描述、说话风格、好奇心、亲近感和敏感度。编辑画像不会重新创建宠物，也不会清空旧经历。聊天读取这份画像；自主活动读取同一份画像、身体需求、设施状态，以及当前宠物最多 5 条相关长期记忆。当前相关性筛选使用有限关键词，尚不是完整的语义检索。

服务端保存饥饿、困倦、探索需求、警觉、口渴、排泄需求、清洁度和由它们推导的心情。它同时管理食盆、水碗、猫砂盆和阅读记录。移动端只展示确认后的数据。基础添粮不动背包；选“用一份背包食物”会在同一事务中扣除 1 份 `test_food` 并添入食盆，最多 3 份。添水和清理猫砂盆同样需要确认，使用中的猫砂盆不能清理。

`pet-activities.ts` 登记十种活动：睡觉、吃饭、喝水、上厕所、看书、张望、探索、休息、靠近、独处。模型只能在当前允许的活动里选择。邀请可以被推迟或拒绝，不能从“答应了”推导出“已经做完”。

## 一次活动怎样走完

1. 服务端选择活动，生成唯一意图。吃喝先预留设施，不立即扣份数。
2. Godot 根据物件的 `life_slots` 找到站位、朝向和接触点，开始移动，报告 `started`。
3. 到达后报告 `arrived`。服务端检查房间、意图、版本、期限和设施，确认 `using`，此时只扣一次份数。
4. Godot 收到使用确认才播放对应姿势；使用时长以服务端 `usingAt` 为起点。
5. 完成报告被接受后，需求、设施和最近经历更新一次。重复请求使用原幂等结果。

途中受阻释放预留。吃喝开始后被打断，按已使用时长计算部分效果，不伪造完整经历；离线补算先结算已开始的使用，避免再次扣同一顿饭。已经关闭自动活动时，普通观察不会取消用户主动邀请的活动。减少动态只改变显示：使用姿势暂停动画，移动直接落到已验证可达的位置，生活逻辑继续。

离开超过五分钟会进行最多三段基础照料补算，不动背包、不发奖励、不逐分钟调用模型。断网时场景只做休息、张望等展示，不自行扣粮或保存“已完成”。未知结果保留原请求体和幂等键。切账号后旧结果不能覆盖新账号。

## API

全部接口都需要登录。写接口必须带 `Idempotency-Key`。

| 接口 | 用途 |
| --- | --- |
| `GET /v1/me/pet/life` | 读取生活状态和画像，不推进活动 |
| `POST /v1/me/pet/life` | 观察、邀请、抚摸、移动软垫与活动回执 |
| `GET /v1/me/pet/profile` | 读取画像 |
| `POST /v1/me/pet/profile` | 按画像版本保存资料 |
| `POST /v1/me/pet/care` | 按生活状态版本添粮、添水、清理 |

新客户端的观察请求示例：

```json
{"protocolVersion":2,"surface":"interior","event":"observe","automatic":true,"intentId":null,"expectedRevision":0,"target":null}
```

`event` 支持 `observe`、`started`、`arrived`、`complete`、`blocked`、`stroke`、`invite`、`move_cushion`。邀请和移动软垫要求 `target` 为 `sunny` 或 `shelter`；邀请还可带登记过的 `invitedActivity`。旧 v1 客户端保留原有七项活动兼容；新活动和到达协议需要 v2。旧待确认请求按原文重放，不强行改版本。

照顾请求示例：

```json
{"operation":"feed","source":"inventory","expectedRevision":12}
```

`operation` 为 `feed`、`refill_water`、`clean_toilet`。`source` 为 `basic` 或 `inventory`，后者只允许喂食。响应包含同一事务里的 `life` 和 `snapshot`。画像使用自己的 `expectedRevision`，生活使用生活版本，背包继续使用玩家存档版本；不能混用。

## 场景和素材

移动端继续使用固定 Godot 4.5.1。宠物和家具共用 390×844 逻辑坐标；背景留出连续地面，床、碗、书、猫砂柜独立摆放。猫窝前沿单独参与遮挡，柜体有碰撞，站位尽量绑定物件偏移。吃喝使用鼻子接触点，不只比较脚底是否靠近碗。

本轮新房间、猫砂柜、书、水碗和吃饭/阅读姿势用生图制作，来源与哈希在 `assets/godot/manifest.json`。旧行走、休息和睡眠动画继续复用；没有调用视频生成。吃饭和阅读使用两帧姿势切换，如厕用柜内隐私表现。这不是完整骨骼动画，3D 原型与真机性能仍未验收。

## 存档与验证

新增迁移 `202610290001_pet_profile` 只增加画像表；旧生活 JSON 在读取时兼容到 v2，保留宠物 ID、已有性格与最近经历。`ops/grant-runtime.sql` 已包含画像表权限。切换此版本前，目标数据库需要执行迁移并更新最小权限；本轮只在独立测试库执行过迁移。

使用 `.nvmrc` 的 Node 24。密钥留在被忽略的服务端环境配置，不放到 RN/Godot。现有 Jev 配置、调用频率和失败规则保留；本轮没有重新调用线上聊天、Jev 或 Seedream 来证明可用性。Jev 失败仍由规则选活动，不影响基本照顾。当前调用额度仍是进程内限制，多副本硬预算不在本轮完成范围。

```sh
npm run check:scaffold
npm run typecheck
npm run test -w @wanpet/server
npm run mobile:test
npm run mobile:prepare-game
npm run build:backend
npm run mobile:bundle
```

`npm run test:integration` 要求 `DATABASE_URL` 与 `TEST_DATABASE_URL` 都指向专用 `wanpet_test_*` 数据库，先在该库执行迁移。场景测试 `apps/godot/tests/cat_life.gd` 覆盖十项活动、到达确认、接触位置、提前完成重试、延后意图取消、减少动态和庭院可达性。加 `--render` 保存当前 RN 场景截图到暂存项目 `.private/living-v2/`。脚本通过和引擎截图不能替代手机整机交互、帧率和耗电验收。
