# iPhone 本机试玩

2026-10-29：已为连接的 iPhone 准备 Debug 试玩包，独立 Bundle ID `com.wanpet.playtest`，使用当前开发团队签名。新版 Godot 场景资源已包含进食、睡姿位置修正。实际安装结果以本次任务消息为准。

后端使用独立本地数据库 `wanpet_phone_preview`，七项迁移已应用。它不是自动化集成测试库；不要在其中运行会改写测试状态的集成套件。首次打开应用自行注册试玩账号，密码至少15字符，不复用重要账号密码。

开发版允许带端口的私有 IPv4 HTTP 地址；iOS 原生请求与 JS 校验保持一致。`Info.Debug.plist` 只由应用 Debug 目标使用，开启本地网络提示及开发传输例外；Release 保留原 Info.plist、HTTPS 校验。Android 原生局域网适配不包含在这次修改中。

当前 Mac 地址为 `10.43.205.56`。App API 为 `http://10.43.205.56:3101/v1`。手机与 Mac 必须在能互通的同一局域网，App 首次请求本地网络时允许访问；Mac 需要保持唤醒。地址改变后需要重新构建配置。

本机需同时运行三个进程（Node24）：

1. 后端：加载被忽略的根 `.env`，覆盖 `DATABASE_URL` 指向上述试玩库，`NODE_ENV=development`、`HOST=127.0.0.1`、`PORT=3100`、`CLIENT_ORIGIN=http://localhost:5173`，运行 `apps/server/dist/main.js`。密钥只在后端环境中，不写入 App。
2. 转发：`node scripts/phone-preview-proxy.mjs 10.43.205.56`。只绑定指定私有地址的3101端口，仅转发 `/v1/` 到本机3100，不配置公网入口。
3. Metro：`npm start -w @wanpet/mobile -- --host 0.0.0.0`，端口8081。

就绪检查：`http://10.43.205.56:3101/v1/ready` 返回 ready；8081/status 返回 packager-status:running。调试版依赖电脑上的 Metro 和服务，停止进程后不能继续联网试玩。

当前签名产物路径：`.tools/iphone-playtest/Build/Products/Debug-iphoneos/WanpetMobile.app`。构建使用设备目的地、自动签名和 `WANPET_API_BASE_URL`；不要把 `INFOPLIST_FILE` 作为全局 xcodebuild 参数，否则会错误覆盖 Pods 的资源包配置。

类型检查和31项移动端会话测试通过，含私有网段范围及 Release 拒绝 HTTP 的回归。实际聊天、生图、性能和长时间运行仍需手机体验确认。
