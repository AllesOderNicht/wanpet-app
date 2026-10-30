# 后端 API

所有路径带 `/v1`。仅注册、登录、health、ready 无需认证。业务认证使用 `Authorization: Bearer <accessToken>`；新会话不按时间过期（expiresAt=null），退出可撤销当前会话，改密撤销全部会话。服务端仅保存 SHA-256 摘要。测试工具应私下保管令牌，不提交到仓库或放入 URL。

写请求使用 `Content-Type: application/json`。JSON 最大 16KiB，语音提交接口单独允许 3MiB，认证后的图片上传接口单独允许 14MiB（解码图片最多 10MiB）；拒绝额外字段。CORS 仅允许配置的精确 Origin，不接受 cookie 认证；Bearer 必须显式发送。当前 RN 客户端使用 iOS Keychain / Android Keystore 加密存储登录凭证，启动经 GET /auth/session 验证后恢复。

| 方法和路径 | 请求 | 成功 |
|---|---|---|
| POST /auth/register | `{email,username,password}` | 201 `{account:{id,email,username},accessToken,expiresAt:null}` |
| POST /auth/login | `{email,password}` | 200，同注册响应 |
| GET /auth/session | 认证 | 200 `{account:{id,email,username},expiresAt}`，不返回令牌 |
| POST /auth/logout | `{}`，认证 | 204，撤销当前会话 |
| PUT /auth/password | `{currentPassword,newPassword}`，认证 | 204，撤销全部会话，需重新登录 |
| POST /me/initialize | `{}`，认证，`Idempotency-Key` | 首次 201 快照；其他键重复初始化 200；同键保持原状态码和响应 |
| GET /me/snapshot | 认证 | 200 快照 |
| POST /me/trips | `{loadoutItemIds,expectedRevision}`，认证，`Idempotency-Key` | 201 `{trip,snapshot}`，服务端旅行验收入口 |
| POST /me/trips/:id/claim | `{}`，认证，`Idempotency-Key` | 200 `{tripId,ledgerEntryId,rewards,snapshot}` |
| GET /health | 无 | 200 `{status:"ok",gameplayReady:false}` |
| GET /ready | 无 | 200 `{status:"ready"}`；数据库不可用/迁移未完成时 503 |

邮箱去首尾空白并统一小写，校验格式及唯一性；暂不验证邮箱所有权。用户名作为宠物称呼，允许中文和重名，去首尾空白后 1–32 个 Unicode 字符。密码不去空白、不截断，9–128 个 Unicode 码点且 UTF-8 不超过 512 字节。旧开发账号保留数据，不提供旧用户名登录入口。暂未实现自助找回密码。

重复邮箱返回 409 EMAIL_TAKEN；格式错误分别返回 INVALID_EMAIL、INVALID_USERNAME、INVALID_PASSWORD。注册响应丢失后不自动重发，用户可用相同邮箱密码登录确认。

初始化幂等键为 1–128 位字母、数字、下划线或短横线。幂等范围为账号和操作；同键返回冻结的原始快照（包括原始 serverNow）。需要当前服务器时间时调用 GET /me/snapshot。不同键重复初始化不会增加 revision 或重复赠送。

快照字段：`player:{id,accountId,username}`、`revision`、`serverNow`（数据库时间 ISO 8601）、`configVersion`、`pet:{id,speciesId,nickname,status}`、`inventory:[{itemId,quantity}]`、`collection:[{itemId,quantity,firstCollectedAt}]`、`activeTrip`。初始化 configVersion 为 starter-v1，宠物物种 test_species、昵称“测试宠物”、状态 AT_HOME；test_food 为 3，test_supply 为 1，activeTrip 为 null，collection 为空。均为测试配置，不是正式设定。未初始化返回 409 PLAYER_NOT_INITIALIZED。历史初始化冻结回执可能不含 collection，新的 GET 快照始终包含它。

出发行囊为 1–3 个不重复的受支持测试道具 ID，各扣 1 件；当前仅支持 test_food/test_supply。expectedRevision 必须是当前版本的正整数；客户端不提交时间、奖励、目的地或 playerId。旅程返回 `{id,status,startedAt,returnAt,configVersion,destinationId}`，不暴露未领取奖励。当前旅程配置 test-trip-v1，test_forest，60 秒；一次只能有一段未领取旅程。到期状态由数据库时间推导；领取原子增加背包与收藏并使 revision +1。详细规则及验收见 [旅行后端切片](travel-backend.md)。

出发同键重试返回原 201 响应，不同键并发只创建一次；相同道具不同排列视为同请求。领取同键或不同键重试都返回首次领取的冻结回执，不再发奖。旧回执可能含旧 revision，不能替代 GET 当前快照。提前领取失败不占用幂等键，可到期后用原键重试；不存在或不属于当前账号的旅程统一 404 TRIP_NOT_FOUND。

错误统一为 `{code,message,requestId}`。400 INVALID_INPUT/INVALID_LOADOUT、401 UNAUTHENTICATED/INVALID_CREDENTIALS、403 ORIGIN_FORBIDDEN、404 TRIP_NOT_FOUND、409 USERNAME_TAKEN/PLAYER_NOT_INITIALIZED/IDEMPOTENCY_CONFLICT/REVISION_CONFLICT/ACTIVE_TRIP_EXISTS/INSUFFICIENT_INVENTORY/TRIP_NOT_READY、413 PAYLOAD_TOO_LARGE、415 UNSUPPORTED_MEDIA_TYPE、429 RATE_LIMITED、503 SERVER_BUSY/DATABASE_UNAVAILABLE/NOT_READY。未知内部错误为 500，不返回异常细节。认证和快照响应不缓存。

注册每 IP 每小时 5 次，登录每 IP 每分钟 30 次且每 IP+用户名每分钟 5 次，改密每账号每小时 3 次，快照每账号每分钟 120 次；出发和领取各每账号每分钟 120 次。429 返回 Retry-After。密码哈希单并发、最多 8 个排队请求，过载返回 503。当前限流在单进程内存中，重启清空；多实例或正式上线前需要独立评估和共享限流。

## 宠物对话接口

聊天、事件轮询、停止/重试、记忆管理与异步语音接口见 [宠物对话 API](pet-chat.md#api)。全部复用现有鉴权和写入幂等，不开放资产操作给模型。

图片上传、Seedream 任务确认/重试/取消、预算与旅程图片接口见 [图片 API](pet-images.md#图片-api)。图片文件通过鉴权读取，不作为公共静态目录暴露。
