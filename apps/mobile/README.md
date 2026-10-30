# 丸宠移动端

React Native 管理账号、导航、行囊、旅行、归来奖励、收藏与设置；Godot 只管理庭廊、小屋、庭院、猫动画和场景交互。后端继续负责存档、库存与旅行结算。

现有页面迁移及两端模拟器主要流程已验收，证据和未覆盖范围见 ../../docs/rn-migration.md。根目录默认客户端入口为 RN；独立 Godot 使用 `npm run dev:godot`。

## 安装与游戏资源

以下命令在仓库根目录运行，使用 `.nvmrc` 指定的 Node 24：

```sh
nvm use
npm ci
node node_modules/@borndotcom/react-native-godot/scripts/download-prebuilt.js
npm run mobile:prepare-game
```

资源构建需要官方 Godot 4.5.1，默认位置 `.tools/godot-4.5.1/Godot.app/Contents/MacOS/Godot`，可通过 `MOBILE_GODOT_BIN` 指定。不能使用独立项目的 4.7 导入缓存。脚本会准备隔离资源项目、运行场景桥接检查，再生成 iOS PCK 和 Android assets；生成文件不纳入 Git。

根目录 postinstall 会应用 react-native-godot 1.0.1 的 UTF-8 长度补丁，防止中文场景事件被截断。若安装时使用了 `--ignore-scripts`，需手动运行 `node scripts/patch-rn-godot.mjs` 后再编译原生工程。升级该库时必须重新评估补丁，脚本会拒绝未知版本。

## 本地运行

先按根目录后端开发文档配置并启动本地服务，API 地址为 `http://127.0.0.1:3100/v1`。开发环境的账号操作会修改该服务的数据库，请使用测试账号。

在仓库根目录启动 Metro：

```sh
npm start -w @wanpet/mobile
```

### iOS

需要 Xcode、兼容的 Ruby 与 CocoaPods。进入 `apps/mobile/ios`：

```sh
bundle install
bundle exec pod install
```

回到仓库根目录：

```sh
npm run ios -w @wanpet/mobile
```

也可打开 `apps/mobile/ios/WanpetMobile.xcworkspace`。Debug 默认连接本机 loopback API。Release 通过 Xcode build setting `WANPET_API_BASE_URL` 设置 HTTPS 地址（映射到 Info.plist 的 `WanpetAPIBaseURL`）；缺失地址会拒绝启动会话，不能作为发布包验收。

模拟器运行需要对嵌入的 Godot 框架有效签名。默认 Xcode/CLI 构建会处理；手工 xcodebuild 时保留签名，模拟器可用 `CODE_SIGN_IDENTITY=-`。不要把 `CODE_SIGNING_ALLOWED=NO` 的编译检查产物直接当作可运行验收包，dyld 可能拒绝加载框架。

### Android

最低支持 Android 10（API 29）：当前 Godot 桥接使用该版本开始提供的原生帧回调。需要 JDK、Android SDK，并设置 `JAVA_HOME` 与 `ANDROID_HOME`。已安装 Android Studio 时可使用其内置 JDK。首次 Gradle 构建会安装所需 NDK/CMake，耗时取决于网络。

模拟器启动后：

```sh
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3100 tcp:3100
npm run android -w @wanpet/mobile
```

Android API 地址可通过环境变量 `WANPET_API_BASE_URL` 或 Gradle 参数 `-PwanpetApiBaseUrl=https://你的服务/v1` 配置，后者优先。Release 只接受 HTTPS，缺失配置时拒绝启动会话。签名配置仍为模板开发配置，不可将 Debug 构建成功视为正式发布准备完成。

## 测试

在仓库根目录：

```sh
npm run mobile:typecheck
npm run mobile:test
npm run godot:check
python3 scripts/check-rn-apk.py apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
MOBILE_TEST_API=http://127.0.0.1:3100/v1 npm run test:live -w @wanpet/mobile
```

`test:live` 使用真实本地 HTTP 服务和独立随机账号，约需一分钟等待服务器旅行到期；测试结束退出会话、清理临时回执文件，账号及旅行账本保留在开发库。不设置 `MOBILE_TEST_API` 时跳过此测试。

组件测试模拟了原生游戏宿主，只验证页面行为与控制逻辑。两端模拟器的真实页面、旅行闭环和场景触摸证据见迁移记录；物理设备、长期内存/耗电、逐帧性能和完整异常矩阵尚未验收。

## 数据与安全边界

令牌只保存在内存，重启后重新登录。未知结果的写操作先保存待确认记录，再发请求；重试复用同一个幂等键。密码和令牌不写入回执文件。客户端不得生成或推断奖励，所有库存、旅行状态和收藏来自后端响应。


Android 原生网络回归（进入 `apps/mobile/android`，配置好 JDK/SDK）：

```sh
./gradlew :app:testDebugUnitTest
```

该测试使用同版本 OkHttp MockWebServer 的本地 socket，验证编码、重定向、响应大小、总超时、只读连接恢复及写入不自动重放。
