# 丸宠APP

2026-10-29：已接通画像、吃喝如厕阅读、照顾回执与新的独立物件场景，新增素材只用生图。[本轮实现与验收范围](docs/refactor-2026-10-29/04-implementation.md)记录已完成内容、数据库接入和后续事项。
原创三花猫与清透水彩“窗边小屋”的轻旅行养成项目。当前移动端采用 React Native + 嵌入式 Godot：RN 负责账号、导航、行囊、旅途、奖励、收藏和设置；Godot 负责分层图片场景、完整精灵动画、寻路与互动。PostgreSQL 后端是库存、旅行结算和收藏的唯一权威。

iOS/Android 原生构建及主要页面、旅行闭环已在模拟器验证。逐项证据和剩余边界见 [RN 迁移记录](docs/rn-migration.md)，完整环境准备见 [移动端开发说明](apps/mobile/README.md)。已接入 Jev 的真实猫日常决策、持续行为和生活记录，配置与验证见 [自主生活](docs/cat-life.md)。已新增 Haiku 对话、宠物动作邀请、自托管 mem0 和语音输入适配，配置与本地验收见 [宠物对话](docs/pet-chat.md)。正式自主出发调度、商店、真实 ASR 识别、真机性能验收及商店发布仍未完成。

## 开发

使用 `.nvmrc` 指定的 Node 24。根目录 `.env` 被 Git 忽略，按 `.env.example` 配置专属开发数据库；不要将凭据填入示例文件。后端步骤见 [开发与部署](docs/backend-development.md)。

```sh
nvm use
npm ci
npm run db:generate
npm run check:scaffold
npm run check:assets
npm run db:validate
npm run check:prisma-config
npm run typecheck
npm test
```

安装移动端引擎预编译库、准备资源，然后启动 Metro：

```sh
node node_modules/@borndotcom/react-native-godot/scripts/download-prebuilt.js
npm run mobile:prepare-game
npm run dev:client
# 另一终端，准备好对应 SDK / Pods 后
npm run mobile:ios
# 或
npm run mobile:android
```

`npm ci` 的 postinstall 会应用已锁定 Godot 桥接版本的 UTF-8 修复；如果使用 `--ignore-scripts`，需手动运行 `node scripts/patch-rn-godot.mjs`。游戏导入器必须使用官方 Godot 4.5.1，与嵌入式引擎匹配，不能复用独立 Godot 4.7 的缓存。

配置开发库后运行 `npm run db:deploy` 与 `npm run dev:server`。默认本地 API 为 `http://127.0.0.1:3100/v1`；CLIENT_ORIGIN 必须配置。`GET /health` 只表示存活，`GET /ready` 同时验证数据库和迁移。Android 模拟器需 `adb reverse tcp:3100 tcp:3100` 及 `adb reverse tcp:8081 tcp:8081`。

## 构建与验证

- `npm run build`：编译后端、导出 Godot 场景资源、生成 iOS 和 Android 正式 JS bundle；不等同于原生签名打包。
- 原生构建：使用 `apps/mobile/ios/WanpetMobile.xcworkspace` 或 `apps/mobile/android/gradlew :app:assembleDebug`，前提及 API 地址配置见移动端说明。
- `npm test`：后端单元测试、RN 会话及组件测试、Godot 回归；`npm run typecheck` 包含 RN。
- `MOBILE_TEST_API=http://127.0.0.1:3100/v1 npm run test:live -w @wanpet/mobile`：真实本地 HTTP 旅行测试，约一分钟，创建独立测试账号。
- `npm run test:integration`：后端数据库集成测试，必须配置独立 `wanpet_test` 数据库。
- `python3 scripts/check-rn-apk.py apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`：逐文件检查 APK 中的 Godot 资源，防止遗漏 `.godot` 目录。

## 工程边界

- `apps/mobile`：当前 RN 应用入口；原生网络、私有回执存储、账号与页面。
- `apps/godot`：嵌入式场景源文件及保留的独立客户端。`rn_scene.tscn` 不拥有账号或经济逻辑。独立入口通过 `npm run dev:godot` 启动，导出通过 `npm run godot:build`。
- `apps/client`：历史 React/Vite + PixiJS 预览，通过 `npm run dev:legacy` 启动。
- `apps/server`：NestJS + Prisma + PostgreSQL；`packages/contracts` 为公开协议，`packages/game-core` 为公共规则/显示类型。
- [图片聊天、Seedream 与明信片配置](docs/pet-images.md)。
- [仓库资源范围与缓存清理说明](assets/README.md)：Git 仅保留当前代码、场景和测试使用的资源，制作中间文件与历史截图保留在本地。
- [API](docs/backend-api.md)、[旅行事务与验收](docs/travel-backend.md)、[架构](docs/architecture.md)、[页面规划](docs/ui-flow.md)、[美术方向](docs/art-direction.md)、[QA 与发布](docs/qa-release.md)。
- [Godot 历史迁移记录](docs/godot-migration.md)、[Godot 开发说明](docs/godot-development.md)保留作为独立客户端对照；当前移动端以 RN 说明为准。

当前测试道具、目的地和奖励不代表正式产品设定。日常行为使用 TokenHub 的 Jev；聊天使用 TokenHub Haiku，长期记忆使用自托管 mem0；正式世界观和商业化仍待确认。GitHub origin 为私有仓库 AllesOderNicht/wanpet-app；不得提交凭据、签名或生产数据。默认禁止 force push；明确授权的历史清理使用精确的 force-with-lease。迁移不自动发布、推送、部署或修改远端数据库；TestFlight 和正式发布另行授权。
