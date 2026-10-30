# 丸宠APP：开发 Skills 与 MCP 调研

核验时间：**2026-10-12 11:40–11:42 UTC**。项目仓库：**wanpet-app**。技术范围：React + TypeScript + PixiJS + Capacitor 客户端，NestJS + PostgreSQL + Prisma 后端。

这些工具用于辅助开发，与游戏内 AI 宠物是两层不同能力。产品已确定包含**宠物聊天与记忆、旅行日记与明信片生成**；本报告不指定模型供应商、记忆实现、玩家数据传输或调用预算。旅行资格、时间和奖励仍由服务端权威结算，不能交给生成式模型决定。本次只调研，未安装或运行第三方工具，未申请凭据或 OAuth 授权。

## 结论：先选四个来源，按需启用

1. **Vercel agent-skills**：React 性能与 UI 检查，限定相关技能。
2. **PixiJS 官方 skills**：场景、资源、触摸、动画与性能，针对性比星数更重要。
3. **Playwright MCP**：本地网页探索与截图；环境已有浏览器能力时直接复用，并把关键流程写成正式测试。
4. **Context7**：按版本查技术文档，作为可选能力；直接读官方文档也能推进开发。

Anthropic frontend-design 可在视觉设计阶段补充；GitHub MCP 留到仓库/CI 协作需要时，有现成连接器就不重复接入。Capacitor 专项技能按问题查阅，不一次装满八套工具。

## GitHub 实时核验

以下为 GitHub REST API 返回的精确快照。**星数属于整个仓库**，不能当成某个 skill 的独立星数，也不能与技能市场安装次数混用。八个仓库均返回 `archived: false`。最近推送只反映仓库活动，不等于发布日期、默认分支提交日期或安全认证。

| 仓库 | GitHub 星数 | 最近推送时间（UTC） | 核验来源 |
| --- | ---: | --- | --- |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 32,271 | 2026-08-28T13:36:31Z | [API](https://api.github.com/repos/vercel-labs/agent-skills) |
| [anthropics/skills](https://github.com/anthropics/skills) | 180,643 | 2026-10-09T18:45:52Z | [API](https://api.github.com/repos/anthropics/skills) |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | 38,049 | 2026-10-08T17:51:59Z | [API](https://api.github.com/repos/microsoft/playwright-mcp) |
| [upstash/context7](https://github.com/upstash/context7) | 62,922 | 2026-10-12T10:43:35Z | [API](https://api.github.com/repos/upstash/context7) |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | 33,545 | 2026-10-08T16:25:41Z | [API](https://api.github.com/repos/github/github-mcp-server) |
| [pixijs/pixijs-skills](https://github.com/pixijs/pixijs-skills) | 353 | 2026-10-01T21:48:50Z | [API](https://api.github.com/repos/pixijs/pixijs-skills) |
| [Cap-go/capgo-skills](https://github.com/Cap-go/capgo-skills) | 72 | 2026-10-12T10:35:26Z | [API](https://api.github.com/repos/Cap-go/capgo-skills) |
| [sessa/pixijs-mcp](https://github.com/sessa/pixijs-mcp) | 1 | 2026-06-06T18:27:31Z | [API](https://api.github.com/repos/sessa/pixijs-mcp) |

## 候选逐项评估

### 1. Vercel agent-skills：首选 React/UI 指导
- **维护方/类型**：Vercel Labs；Agent Skills 集合，不是 MCP 服务。
- **具体路径**：[skills/react-best-practices/SKILL.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md)、[skills/web-design-guidelines/SKILL.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)。前者声明的技能名为 `vercel-react-best-practices`，与目录名不同。
- **适用**：背包、明信片、设置等 React 界面，加载、重渲染和包体优化。只采用适合 Vite/Capacitor 的规则，不因文档包含 Next.js/RSC 就引入它们；Pixi draw call 优化另行处理。
- **许可/风险**：React skill 声明 MIT；仓库 API 未识别顶层许可，其他技能需单独核验。UI skill 会抓取外部规则，应检查内容，不能把远端文本当成高权限指令。无需启用部署、令牌管理等无关技能。

### 2. Anthropic frontend-design：视觉设计阶段可选
- **维护方/类型**：Anthropic；技能集合。路径：[skills/frontend-design/SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)。
- **适用**：原创宠物、房间、旅行手账的视觉方向、配色、字体与反馈设计；它是设计指导，不是图片生成器或游戏运行时依赖。
- **许可/边界**：所选技能的 [LICENSE.txt](https://github.com/anthropics/skills/blob/main/skills/frontend-design/LICENSE.txt) 为 Apache-2.0，不能推广到整个集合。设计仍需手机截图和人工检查；借鉴轻放置旅行体验，角色、美术、文案和界面表达保持原创。

### 3. Microsoft Playwright MCP：缺少浏览器工具时启用
- **维护方/类型/许可**：Microsoft；真实浏览器自动化 MCP；Apache-2.0。[入口与配置](https://github.com/microsoft/playwright-mcp)，npm 包 `@playwright/mcp`，要求 Node 18+ 与兼容 MCP 的宿主。
- **适用**：本地网页的出发、返回、领奖流程，React 控件、响应式布局、截图和控制台错误。上游也推荐编码代理考虑 CLI + skills，选择一种控制方式即可。
- **限制**：可访问性树不能自动解释 Pixi canvas 内所有精灵。需补 DOM 控件/标签、固定测试时钟与随机种子、截图断言或仅开发态调试接口。浏览器 WebKit 测试不能替代 Capacitor WKWebView 插件、后台恢复和 GPU 的 iOS 真机测试。
- **安全**：使用独立临时浏览器配置与本地测试数据，不连接个人登录会话或生产凭据。上游明确说明 MCP 不是安全边界，来源过滤也不是沙箱。探索性操作不能替代提交到仓库的回归测试。

### 4. Upstash Context7：按版本查文档的可选层
- **维护方/类型/许可**：Upstash；文档 MCP，也提供 CLI/skills；仓库许可 MIT。[入口](https://github.com/upstash/context7)，官方远端 `https://mcp.context7.com/mcp`，工具包括 `resolve-library-id`、`query-docs`；CLI 需要 Node 18+。
- **适用**：核对 Pixi API、Capacitor 生命周期、NestJS 校验、Prisma 事务。先确认库和版本确实被索引；搜到同名库不代表包含需要的版本。缺失时直接读官方文档。
- **安全**：查询会发送到外部服务，只发送库名、版本与去敏问题，不包含密钥、私有数据库样例或玩家信息。返回内容是资料，不是操作授权。`ctx7 setup` 可能启动 OAuth 并生成密钥，不能作为普通查阅命令自动执行；仓库不包含完整后端/爬取系统。

### 5. GitHub 官方 MCP：仓库协作阶段再考虑
- **维护方/类型/许可**：GitHub；真实 MCP；MIT。[入口](https://github.com/github/github-mcp-server)，源码入口 `cmd/github-mcp-server`，镜像 `ghcr.io/github/github-mcp-server`，远端 `https://api.githubcopilot.com/mcp/`。
- **适用**：读取 issues/PR、代码差异和 CI 失败；获得授权后再创建 PR。宿主需支持远端 MCP，或通过 Docker/原生程序运行本地服务，认证支持因宿主而异。
- **安全/取舍**：已有 GitHub 连接器时复用。初期限定仓库与工具集，本地 `--read-only` 关闭写工具，凭据本身也要最小权限；不能为了查看 CI 就增加部署、合并、发布权限。新建持续访问或扩大 OAuth 授权须另行确认。

### 6. PixiJS 官方 skills：低星但直接匹配，优先选
- **维护方/类型/许可**：PixiJS 官方组织；Agent Skills 集合；MIT。[路由入口 skills/pixijs/SKILL.md](https://github.com/pixijs/pixijs-skills/blob/main/skills/pixijs/SKILL.md)。
- **具体子路径**：`skills/pixijs-application/SKILL.md`、`skills/pixijs-assets/SKILL.md`、`skills/pixijs-events/SKILL.md`、`skills/pixijs-ticker/SKILL.md`、`skills/pixijs-scene-sprite/SKILL.md`、`skills/pixijs-performance/SKILL.md`。
- **适用/兼容**：面向 PixiJS v8，覆盖场景初始化/销毁、资源、精灵、触摸、动画与内存性能。它是开发指导，不进入游戏生产依赖；具体 API 仍需匹配锁定的小版本。
- **风险**：路由可能抓取比项目版本更新的在线文档。实验性渲染能力先做目标 iPhone 验证，测试销毁重建和上下文丢失；只载入实际需要的子技能。

### 7. Capgo Capacitor skills：专项补充，选择性查阅
- **维护方/类型**：Capgo 生态厂商，非 Ionic 官方；技能集合。名为 `capacitor-mcp` 的 skill 只是指导文档，本身不是 MCP 服务。
- **具体路径**：[skills/capacitor-best-practices/SKILL.md](https://github.com/Cap-go/capgo-skills/blob/main/skills/capacitor-best-practices/SKILL.md)、`skills/safe-area-handling/SKILL.md`、`skills/capacitor-offline-first/SKILL.md`、`skills/capacitor-testing/SKILL.md`，另有 `plugins/` 分组副本。
- **适用/兼容**：安全区、原生边界、存储、生命周期和发布检查。当前资料涉及 Capacitor 8 稳定版与 9 预发布，需对照所选版本的官方 Capacitor/Apple 文档。
- **许可/风险**：README 声称 MIT，但 API 未识别顶层许可，检查的树中未见 LICENSE 文件，复制分发前应澄清。包含商业云、OTA 与扫描工具推荐，不应顺带注册账号、上传构建或安装全部分组。

### 8. sessa/pixijs-mcp：实验性观察项，首版不装
- **维护方/类型/许可**：个人维护者 `sessa`；真实 Pixi 调试 MCP；MIT。[入口](https://github.com/sessa/pixijs-mcp)，`src/index.ts` 与页面侧 `src/agent.ts`。
- **适用/兼容**：通过 Chrome DevTools Protocol 读取场景树、渲染/ticker 状态、截图并修改节点；README 面向 Pixi v8，部分兼容 v6/v7。CDP 路线不能直接替代 iOS WKWebView 调试。
- **风险**：只有 1 星且最后推送在 2026 年 6 月，采纳和维护证据不足。README 的 npm 描述仍带“发布后”条件，本次未核实已发布包，不能认定同名 npm 包就是该仓库。若以后试用，只接回环地址的专用开发浏览器，不使用个人登录配置，不把调试全局对象带入生产。

## 安装前检查与使用顺序

1. **先复用现有能力**：确认宿主支持的 skill/MCP 格式，优先项目级配置；技能可先作为已审阅文档参考，不必安装整个市场。
2. **锁定来源**：skill 固定到审阅提交，服务固定版本或镜像 digest；检查完整目录、脚本、安装钩子、依赖、远端 URL、许可证及安全公告。复制技能时保留许可与必要引用文件，不能只复制缺少目标子技能的路由。
3. **按需启动**：Playwright 使用固定版本和隔离浏览器，避免盲用 `@latest` 或把未认证服务暴露到网络。Context7/GitHub 优先用已有连接；新增 OAuth、密钥或持续权限单独走确认，不把令牌放进仓库或聊天。
4. **小范围验证**：先跑一个只读/本地用例，再记录来源、版本、用途与许可。上游常见 `npx skills add <repository>` 是未执行的发现入口，不是本报告已验证的可复现安装方案。

已检查的 skill 集合快照提交：Vercel `063bee94c3f4df8453406c830b0a7df0f2860278`；Anthropic `dbd4588f9e1033efb41dad4bef2f7947c8993d44`；PixiJS `83760c6f53462ca9cecd68055041f5a8c94758ce`；Capgo `be68f0e260932c51d1f53b4315e74f8dbe80df3c`。这些标识用于复核，不代表已完成代码安全审计。

## 项目验收重点

- React 负责常规可访问界面与低频状态，Pixi 负责渲染循环，避免逐帧 React setState。
- 用代表性旧款 iPhone 检查安全区、分辨率、内存、发热、前后台切换和渲染恢复；分别保留纯 TS 状态机测试、浏览器流程测试与 iOS 原生验证。
- NestJS 校验请求，服务端时间和数据库事务决定旅行/奖励，使用幂等及唯一约束防重复发奖。不把生产 PostgreSQL 交给通用数据库 MCP。
- 所有文档对应实际锁定版本；工具不自动保证 App Store 审核通过，也不替代原创美术、内容与产品设计。

## 排除项与证据说明

不建议安装重复的通用 shell/文件系统 MCP、宽权限数据库 MCP、未经检查的大型技能包或自动部署/支付工具。Pixi/Conda 包管理器的 `pixi-skills` 与 PixiJS 图形库无关；React、PixiJS、Capacitor 或 MCP SDK 本体的星数不能冒充助手集成的星数。

元数据来自上表 GitHub API；路径通过递归 Git tree 核验，功能和许可通过链接中的官方 README/SKILL/原始许可文件检查。未把市场安装量当作星数。风险判断是本项目范围内的建议，不是安全认证；正式安装前需重新核验。
