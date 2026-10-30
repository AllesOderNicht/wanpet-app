# 测试、CI 与 iOS 交付

> 2026-10-17 Godot 迁移：当前正式客户端、资源格式和验收边界见 [Godot 开发说明](godot-development.md) 与 [迁移记录](godot-migration.md)。下文 React/PixiJS/Capacitor 和 v1 导入相关内容保留为此前阶段记录，不表示当前交付技术栈。

当前接口与验证命令见 [backend-api.md](backend-api.md) 和 [backend-development.md](backend-development.md)。[基础阶段历史验收](backend-validation.md) 包含此前本地及阿里云 PostgreSQL 17 实测；新增的 [旅行后端验收](travel-backend.md) 只在本地隔离 PostgreSQL 14 验证，未部署远端。账号、初始化、旅行出发/领取、账本和收藏有真实数据库测试；家园动画已有浏览器预览验收，正式账号旅行 UI、AI 与 iOS 尚未实现。

## 必须通过的测试层

1. 纯规则：道具数量/价格/配置版本边界；共享函数无系统时钟与随机副作用。
2. 真实 PostgreSQL 集成：出发扣除、领取账本、事务回滚、唯一索引、并发出发/领取、同键不同 payload、错误归属、库存非负。
3. API 合约：无认证、越权、无效输入、旧 revision、速率限制、到期边界；OpenAPI 与客户端运行时校验一致。
4. UI 流程：双击、网络超时、重试、关闭再开、返回、前后台切换、过期登录、低电量/减少动画、文字放大与 VoiceOver。
5. 存档恢复：已绑定可恢复身份在清缓存、换设备、换账号后重新登录恢复；未绑定匿名账号明确提示无法保证重装恢复。服务重启、恢复数据库备份后保持资产一致。
6. AI（实现后）：超时、拒绝、超长/不当内容、提示注入、预算限额、记忆删除；所有失败不影响权威经济状态。

重点故障矩阵：提交前断网无写入；提交后响应丢失可同键恢复；100 路并发 claim 只有一条账本；客户端时间 ±7 天不改变 returnAt；跨玩家 tripId 不可访问；数据库异常不得部分扣除。

## CI 建议

仓库建立后：检查格式/类型 → 单元测试 → PostgreSQL 临时服务与迁移验证 → 集成测试 → 客户端/服务端构建 → 依赖与密钥扫描。PR 上禁止生产凭据；fork PR 不运行带写权限步骤。首次依赖兼容确认并生成锁文件后使用 npm ci。当前已提供 .github/workflows/backend.yml，包含 PostgreSQL 17 集成测试；尚未推送，未验证 GitHub 实际运行。

## iOS 路线

1. 确认 Bundle ID、Apple Developer 团队、最低 iOS/Xcode 版本和签名方式，依据选定 Capacitor 版本的官方要求。
2. Web 构建后生成 Capacitor iOS 项目并 sync；当前尚无 ios/ 工程；未来须版本控制原生工程与非敏感配置，只忽略 Pods、build、DerivedData、xcuserdata 与签名文件。
3. 在 macOS/Xcode 编译、模拟器与至少一台真机验证；当前云端脚手架不代表已完成原生构建。
4. App 回前台刷新 serverNow 与快照；处理网络切换、安全区、软键盘和系统返回。
5. 检查隐私标签、所用 SDK 的 Privacy Manifest、账号删除入口、AI 数据告知与年龄定位。通知在解释用途后按需申请，拒绝不影响主循环。
6. 若未来选 IAP，服务端校验交易与幂等入账、恢复购买；商业化未确定前不接支付。
7. 内部 TestFlight → 邀请小范围测试 → 验证崩溃/卡顿/经济一致性与反馈 → 再单独批准 App Store 提审。

官方政策与工具版本会变，实施时重新核对 Apple/Capacitor 官方文档；本文件是流程计划，不是已完成合规审查。

## 可观测性与上线门槛

日志带 requestId/匿名 playerId/tripId，不写凭据或聊天正文；监测 API 错误率、start/claim 成功率、幂等冲突、负库存违规、账本重复、数据库延迟。AI 加入后额外跟踪成本/拒绝率/兜底率。配置回滚不改历史旅行，数据库迁移先备份与恢复演练。生产发布前有灰度、回滚及负责人。

## 准备阶段记录（2026-10-12，保留历史验证范围）

已执行：官方 npm registry 安装（`--ignore-scripts`，261 packages）、生成 package-lock.json、四个 workspace 的 TypeScript 检查、Vite 客户端与 NestJS 服务端构建、编译后 GET /v1/health 烟测（status=scaffold、gameplayReady=false）、本地必要文件/JSON 检查与常见凭据模式扫描。

未执行：依赖生命周期脚本、Prisma generate/迁移、数据库事务测试、浏览器视觉 QA、AI API、iOS 编译、TestFlight、部署。健康烟测只证明占位服务启动，未连接数据库。没有测试用账号或真实密钥写入仓库。

### 依赖审计修复与兼容性记录

2026-10-12 首次 npm audit 报告 3 项 high，均来自 [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)：deepmerge-ts <8.0.0 对递归对象可栈耗尽，传播至 @prisma/config 与 prisma。普通 npm audit fix 未修复；未使用 --force 或安装 Prisma 预发布版本。

当前保留 Prisma 6.19.3，在根 package.json 对 @prisma/config 的 deepmerge-ts 做限定覆盖到 8.0.0。已阅读 [8.0.0 发布说明](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)：主要不兼容项包括 Map 深合并与部分类型/可变合并行为。检查当前 Prisma config 实际仅导入 deepmerge 供配置对象合并，本项目不使用 Map 配置或变更的类型 API。新增 `npm run check:prisma-config` 实测普通对象合并、递归对象安全回归与 Prisma 配置文件读取，均通过；不代表完整 Prisma 数据库兼容性。

覆盖后的类型检查、客户端/服务端构建、健康端点再次通过，npm audit 全部依赖为 0 个漏洞。当前 npm 11.9.0 的 npm ls 仍将 8.0.0 相对上游固定 7.1.5 标为 invalid；这是本仓库有意跨上游固定版本覆盖的提示，需在后续升级 Prisma 原生修复版本后移除覆盖并复验。数据库接入前还需 Prisma generate/schema/迁移与真实数据库测试。

已解析主要版本：React 19.3.0、Vite 6.4.4、Capacitor 7.6.9、NestJS 11.2.7、Prisma/client 6.19.3、TypeScript 5.9.3。此处记录实测组合，不声称各主版本是最新或已完成 iOS 兼容验证。

## 宠物对话本地切片（2026-10-23）

Haiku/Codex SDK、宠物工具、mem0 和语音适配的验证证据、已修复边界与未验收项目集中记录在 [宠物对话](pet-chat.md#2026-10-23-本地验证记录)。本轮为本地实现和验收，没有推送或部署；不得将模拟转写和模拟器录音描述为真实 ASR 或物理设备验收。

## 图片聊天本地切片（2026-10-23）

新增图片的验证证据、故障恢复语义、真实 Seedream 费用和设备边界见 [图片验证记录](pet-images.md#验证脚本与证据)。真实模型调用、数据库故障测试、原生构建、模拟器交互分别记录；物理设备相机及真实弱网不标为通过。
