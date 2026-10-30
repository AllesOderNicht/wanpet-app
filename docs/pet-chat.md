# 宠物对话、长期记忆与语音输入

本切片为本地开发版本。首页“和它聊聊”提供普通 Agent 对话、停止、重试、历史记录、动作进度和记忆管理。Haiku 负责对话；Jev 继续决定真实猫是否接受家园动作邀请。旅行期间可聊天，家园动作返回不可执行结果。未配置语音时保留完整文字聊天。

## 运行链路

`RN → 认证 API → PostgreSQL 轮次队列 → Codex SDK → TokenHub /v1/responses → Haiku`。

锁定 `@openai/codex-sdk@0.164.0`、`mem0ai@3.3.1`；默认 `claude-haiku-5.5`，失败不会自动换模型。`TOKEN_HUB_WEB_URL` 只作为文档地址，实际 API Base URL 使用 `TOKEN_HUB_API_BASE_URL`，默认 `https://us-api.tokenhub.com/v1`。Jev 与聊天复用现有 TokenHub 密钥，密钥始终留在服务端。

每轮建立新的 Codex 线程和临时 HOME/CODEX_HOME/工作目录，用宠物专属指令替换编程指令。关闭 shell、apply_patch、JS REPL、多 Agent、Apps、网页搜索和 SDK 历史持久化。唯一 MCP 服务为每轮独立、带随机凭据、仅监听 loopback 的宠物工具服务。SDK 自带的通用 MCP 资源工具经本地 Responses 代理从请求中移除；返回流中的非宠物工具调用在到达 CLI 执行器前被拒绝。TokenHub 密钥仅由代理持有，不传给 CLI。环境不继承开发者配置或其他密钥，轮次结束删除临时目录。

工具只有 `get_pet_state`、`invite_pet`。邀请活动为 `approach/rest/sleep/eat/watch/sniff/retreat`，经 CatLifeService、Jev 和生活状态 revision 校验。每轮只能产生一次邀请，使用 `chat-<turnId>` 幂等凭据；失败重试沿用原邀请结果。`accepted` 只表示接受，Godot 确认后才发布 `started/completed/blocked`。动作结果与生活状态同事务写入，不开放旅行、奖励、库存或文件操作工具。

## 本地配置与启动

先完成 [基础后端环境](backend-development.md)。新增迁移为 `202610230002_pet_chat` 和 `202610230003_memory_task_generation`；迁移使用独立迁移角色，运行角色的新增表权限见 `ops/grant-runtime.sql`。本轮不更新远端数据库。

在被忽略的根目录 `.env` 中启用聊天，复用已配置的 `TOKEN_HUB_API_KEY`：

```dotenv
PET_CHAT_ENABLED=true
PET_CHAT_MODEL=claude-haiku-5.5
PET_CHAT_DAILY_TURNS=100
```

mem0 运行在 API 的隔离子进程中，无需另起 Python HTTP 服务。向量数据库可用 Compose 自托管：

```sh
cp ops/memory.env.example .env.memory
chmod 600 .env.memory
# 编辑 .env.memory，替换 MEM0_POSTGRES_PASSWORD。
docker compose --env-file .env.memory -f ops/compose.memory.yml up -d
```

在 `.env` 配置以下值，数据库 URL 中的密码须进行 URL 编码：

```dotenv
MEM0_DATABASE_URL=postgresql://wanpet_memory:<encoded-password>@127.0.0.1:54329/wanpet_memory
HUOSHAN_API_KEY=<火山方舟私有API密钥>
```

也可使用现有独立 PostgreSQL 数据库，先安装并启用 `vector` 扩展。mem0 使用 2048 维、`wanpet_memories_vision_251215` 集合，Haiku 经 TokenHub 的 OpenAI 兼容接口提炼记忆，火山方舟 `doubao-embedding-vision-251215` 生成嵌入。记忆文本和检索文本会发送至火山方舟并产生对应 API 用量；密钥只配置在受限环境中。该数据库凭据需要创建 mem0 表的权限，不复用只允许业务 DML 的应用角色。服务端可访问数据库和火山方舟即可；手机不直接连接它们。

```sh
npm run db:generate
npm run db:deploy
npm run build:backend
node --env-file=.env apps/server/dist/main.js
```

Compose 的 PostgreSQL 只暴露在 127.0.0.1。`vector_data` 保存向量；普通 `compose down` 保留数据，不使用 `down -v`。备份需同时覆盖业务 PostgreSQL 和向量数据库。删除记忆不自动销毁已有备份，恢复备份后需重新执行对应删除操作。更换模型使用独立集合；迁移将包含有效记忆的会话标记为待重建，由后台从业务库的记忆原文重新索引。旧集合不会自动删除，需按保留和删除策略单独处理；回退旧版本需重新标记重建，不能混用模型向量。

## 保留、来源与删除

业务 PostgreSQL 保存原文、轮次状态、工具结果、可管理的记忆条目和持久提炼任务；mem0 保存可检索的向量及来源 metadata。记忆按服务端确定的 `petId:contextEpoch` 隔离，宠物归属绑定认证账号，客户端不能选择别人的命名空间。

每轮注入同一上下文版本内最近 10 轮完整对话、最多 5 条相关记忆和当前宠物事实。聊天不读取 Codex 旧线程，也不把旧生活记录或已结束旅程重新塞入事实上下文。现有生活记录继续服务猫的日常模拟。

回复完成后自动提炼用户陈述；助手生成的文字从不送入提炼。图片、图片描述、带图消息以及显式引用图片的后续记忆请求均排除，详见 [图片规则](pet-images.md)。只有应用确认完成的邀请经历才追加为共同经历，来源关联对应轮次。敏感事实须有明确记忆请求，密码、验证码和密钥始终排除；提炼指令和写入过滤同时约束。管理页展示内容、来源和更新时间，支持编辑、删除、清空。

- 删除/纠正记忆：立即修改业务条目、递增上下文版本、取消旧生成；旧提炼结果不能写回。下一轮不再注入旧版本聊天原文，避免从历史中重新学回已删除事实。
- 当前版本以保留的业务条目重建向量；旧命名空间异步清理。删除立即影响聊天，向量的物理清理可能等待服务恢复。
- 删除对话：清空这一问一答及其工具事件，取消提炼并重建上下文。已经保存的长期记忆独立保留，来源显示为已删除，可在记忆页另行删除。
- 聊天和长期记忆默认保留到用户删除。单独删除一条记忆不会删除游戏存档、当前状态或历史聊天页面中的原文。

记忆检索最多等待 10 秒，提炼和重建子进程最多运行 120 秒。重建保留已完成条目，可在中断后继续，避免记忆较多时每次超时都从头开始。记忆服务故障时文字聊天继续，显示“长期记忆暂不可用”，持久任务按退避重试。未配置 mem0 时不积压提炼任务；配置后从新消息开始提炼。每次动作完成递增提炼任务版本，保证旧任务不能误删刚新增的共同经历任务。异常或超过 9999 条的供应商快照不会覆盖业务条目。

## API

以下路径均以 `/v1` 开头，复用 Bearer 鉴权；所有 POST 带 `Idempotency-Key`，拒绝额外字段。读请求每账号 360 次/分钟、写请求 20 次/分钟。正文通常限制 16 KiB；仅语音提交允许最大 3 MiB JSON。

| 方法与路径 | 请求/结果 |
|---|---|
| GET `/me/pet/chat?before=<turnId>` | 最多 30 轮，从旧到新；返回下一页游标、聊天/语音是否启用 |
| POST `/me/pet/chat` | `{text,surface}`，text ≤4000 字符；立即 202 `{id}` |
| GET `/me/pet/chat/:id/events?after=<cursor>` | 最多 100 条新增事件、当前轮次和新游标；移动端每秒轮询 |
| POST `/me/pet/chat/:id/stop` | `{}`，停止生成；已接受的宠物动作不会被撤销 |
| POST `/me/pet/chat/:id/retry` | `{}`，只重试失败轮次；上下文已变化时需重新发送 |
| POST `/me/pet/chat/:id/delete` | `{}`，删除这一问一答 |
| GET `/me/pet/memories` | 记忆列表和 ready/pending/unavailable 状态 |
| POST `/me/pet/memories/:id/update` | `{text}`，最多 1000 字符 |
| POST `/me/pet/memories/:id/delete` | `{}`，删除一条 |
| POST `/me/pet/memories/clear` | `{}`，清空全部 |
| POST `/me/pet/speech` | `{audio}`，base64 WAV；立即 202 `{id}` |
| GET `/me/pet/speech/:id` | 识别状态、转写文本、错误码 |
| POST `/me/pet/speech/:id/cancel` | `{}`，取消任务并清空转写 |

客户端只展示 SDK 实际正文和工具返回的进度，不伪造逐字输出或显示模型内部推理。发送/控制操作先保存本地待确认凭据，断网后用同键核对。服务重启不会自动重放可能已执行的动作；失联任务在 130 秒后变为 `CHAT_INTERRUPTED`，用户显式重试仍复用原邀请记录。

每宠物最多一轮排队/生成，服务单实例最多并行 4 轮，每轮总计 120 秒。账号默认每天 100 次尝试，按 UTC 日期计算，失败后的显式重试也计额；同键重放不重复计额。额度通过 `PET_CHAT_DAILY_TURNS` 调整。当前实现以单 API 实例为边界，扩容前需要记忆维护租约和共享限流，不能直接启动多副本。

## 语音

Android/iOS 原生录制 16 kHz、单声道、PCM16 WAV，最长 60 秒。流程为“录音 → 异步识别 → 填入可编辑草稿 → 用户点击发送”，识别结果不会自动变成聊天消息。切后台、关闭页面或取消时清理录音。

默认适配百炼 `qwen3-asr-flash`；以下凭据留待实际开通配置：

```dotenv
ASR_API_KEY=<private-key>
ASR_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ASR_MODEL=qwen3-asr-flash
```

未配置返回 `ASR_NOT_CONFIGURED`，文字聊天照常。服务端按真实 WAV 采样长度校验 60 秒上限；每账号一个识别任务，全局最多四个，45 秒超时。音频仅临时保存在内存或原生临时文件，成功、失败、取消后清理；不会写入幂等日志或长期记忆。服务重启后的遗留任务标记失败，需要重新录制；转写草稿在 15 分钟后从服务端清除。

## 验收方法与边界

先运行 `scripts/check-pet-agent-boundary.mjs` 验证实际工具白名单，再运行 `scripts/check-pet-chat-model.mjs` 验证真实 Haiku 普通回复、显式历史上下文和 MCP 工具结果。完整真实记忆验收使用 `scripts/check-pet-chat-live.mjs`，必须提供独立 `wanpet_test` 前缀数据库、mem0 数据库和火山方舟密钥；仅创建合成测试账号，不使用玩家资料。

```sh
node scripts/check-pet-agent-boundary.mjs
# MEM0_DATABASE_URL 必须指向 wanpet_test 前缀的隔离向量库。
node --env-file=.env scripts/check-pet-memory.mjs
node --env-file=.env --import tsx scripts/check-pet-chat-model.mjs
# 先在独立 TEST_DATABASE_URL 对应的库应用迁移；环境变量覆盖 .env。
node --env-file=.env scripts/check-pet-chat-live.mjs
```

`--serve` 启动 31823 端口的隔离移动端验收服务，使用真实 Haiku/Jev，语音转写替换为固定的合成结果；它仅用于验证原生录音上传和草稿流程，不代表真实 ASR 识别通过。

设计取舍见 [ADR](adr/0003-pet-agent-memory.md)，领域术语见 [CONTEXT.md](../CONTEXT.md)。接口和模拟测试不能替代真实语音识别、物理设备麦克风和性能验收；本次不包含部署或商店发布。

资料：[TokenHub Codex 接入](https://tokenhub.com/docs/integrations/codex)、[mem0 配置](https://docs.mem0.ai/open-source/configuration)、[百炼 ASR](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)。

### 2026-10-23 本地验证记录

- 全 workspace 类型检查、Prisma schema 校验和基础文件检查通过；后端单元测试 22 项、PostgreSQL/HTTP 集成测试 52 项通过。
- RN 会话测试 21 项、组件测试 21 项通过；iOS/Android JS bundle 成功，Android ARM64 APK 与原生录音模块构建成功，iOS ARM64 Simulator 构建成功。
- Codex 实际模型请求的工具清单仅有两个宠物工具；真实 TokenHub Haiku 的普通回复、显式历史和 MCP 调用通过。真实 Jev 的饥饿→进食、疲倦→睡觉、过度触摸→退开三组状态通过；模糊状态仍可能走已有低置信度规则兜底，不代表每次邀请都由模型选定。
- 真实 mem0 + pgvector + BGE-M3（旧方案） 完成提炼、删除来源聊天后的跨线程召回、清空后的上下文排除；独立向量烟测通过同版本重建不重复、命名空间隔离、检索和物理删除。
- Android 模拟器实测文字发送、生成状态、真实回复、记忆内容/来源展示、麦克风授权、原生 WAV 上传、转写进入草稿、编辑及手动发送。ASR 使用固定模拟转写，录音 WAV 共 1,478,700 字节，没有验证真实语音内容的识别准确度。
- 使用合成账号和受控猫状态验收实际动作，数据库持久事件顺序为 `requested → started → completed`，Android 页面显示“靠近 · 已完成”。最初 100 秒观察脚本超时，随后从数据库与界面确认完成；这不构成设备性能达标证明。Godot 87 项检查和七种活动的实际导航、单次开始/完成事件检查通过。
- 一条共同经历提炼曾进入不可用状态。恢复服务后，原持久任务自动重试并保存一条来源关联记忆，状态回到 ready，任务删除。首次失败未保留 SDK 原始错误，不能仅凭耗时断言根因；现在只记录不含正文/凭据的阶段、错误类型和 HTTP 状态。

验收截图和日志在本机 `.tools/chat-qa/`，不作为运行资源打包。测试使用 `wanpet_test_chat20261023`、`wanpet_test_chatlive20261023` 和 `wanpet_test_mem020261023` 隔离库，未修改远端数据库。模型缓存保存在本次 Docker 命名卷 `wanpet-chat-ollama`，测试容器可停止而保留缓存。

剩余边界：真实 ASR 凭据和识别验收、物理设备麦克风/性能、iOS 录音交互尚未完成；单实例限流/维护不支持直接扩容。Android 开发过程中修改 AppShell 的热更新曾触发 `librtngodot.so` 空指针崩溃，冷启动后完成上述验收；开发时修改引擎宿主后应完整重启，热更新稳定性未列为已通过。
