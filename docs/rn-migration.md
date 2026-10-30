# React Native 全量迁移

目标：RN负责应用页面和业务状态，Godot仅负责互动场景。保留现有独立Godot入口作为迁移期间的对照，两端主要页面及场景设备验收后，默认开发入口已切为 RN；当前已有功能的页面迁移与模拟器验收已完成；真机性能和正式发布另行验收。

| 页面/能力 | 归属 | 必须保留的行为 | 状态 |
|---|---|---|---|
| 登录/注册/初始化 | RN | 校验、错误、会话失效、初始化幂等 | 已迁移；组件测试及两端模拟器主要流程通过 |
| 首页 | RN壳+Godot场景 | 已选庭廊、动态猫、入口、离家隐藏猫 | 已迁移；组件测试及两端模拟器主要流程通过 |
| 小屋/庭院 | Godot场景+RN控件 | 寻路、碰撞、121帧、起停、耳尾、趴下起身 | 已拆分；两端场景显示和触摸验证通过 |
| 行囊 | RN | 库存过滤、选择、出发禁用、请求持久化 | 已迁移；组件测试及两端模拟器主要流程通过 |
| 旅途 | RN | 服务端时钟、刷新、领取条件 | 已迁移；组件测试及两端模拟器主要流程通过 |
| 归来奖励 | RN | 只显示服务器已确认奖励、不重复领取 | 已迁移；组件测试及两端模拟器主要流程通过 |
| 收藏 | RN | 森林/溪流/草地插画、数量、日期、空态 | 已迁移；组件测试及两端模拟器主要流程通过 |
| 设置 | RN | 自动活动、减少动态、改密、退出 | 已迁移；组件测试及两端模拟器主要流程通过 |
| 离线/待确认/后台恢复 | RN | 同幂等键重试、账户隔离、防旧响应覆盖 | 故障回归、真实 HTTP 重放及 Android 后台恢复通过 |
| 权威存档/旅行/奖励 | 既有后端 | 事务、认证、幂等和版本检查 | 不迁移 |

## 工程与兼容性

apps/mobile由官方React Native社区CLI20创建，RN0.81.0/React19.1.0，对齐接入库示例。@borndotcom/react-native-godot1.0.1默认LibGodot4.5.1.migeran.2；当前独立项目是4.7.2，必须验证场景和资源导入兼容性，不能直接把4.7生成的缓存交给4.5使用。

## 测试交付标准

- 纯业务：响应验证、初始化、账户切换、离线与损坏响应、持久化失败、同键重试、单调版本、过期会话、服务端倒计时。
- 页面：逐页真实组件测试，导航、禁用、选中、空态、错误、长列表、安全区和减少动态。
- 场景：RN命令/事件契约，场景切换保留状态，后台暂停恢复，循环挂载不泄漏；Godot已有导航及动画回归保留。
- 原生：iOS/Android工程构建；实际运行、触摸、字体、前后台、内存与启动验证分别记录，不拿mock通过冒充引擎运行。
- 完成时更新默认开发/构建/测试入口及文档。迁移中不删除原有功能、不修改用户存档、不发布。

## 第一批实现与验证

已创建RN0.81原生工程并安装依赖。src/screens/Pages.tsx包含登录、行囊、旅途、归来、收藏、设置六类页面组件；src/session迁移了响应验证、会话、初始化/旅行操作回执、同键重试及服务器倒计时。

Node24.14.1下TypeScript检查通过；纯业务9项、页面组件7项通过（CLI模板另有1项，不算页面迁移验收）。首次组件测试发现双React实例，已在Jest与Metro限定移动端React解析。测试选择器改用可访问标签与真实onPress，失败时也清理挂载树，避免计时器遗留。

尚未完成：App根入口/导航接线、持久化与原生网络适配、首页与活动场景、Godot桥接、前后台/减少动态系统事件、原生依赖编译和设备验证。页面组件通过测试不等于全量迁移完成。RN fetch不保证禁用重定向，原生适配必须实现不跟随重定向，不能直接绕过会话层的安全边界。

依赖安装首次使用系统Node20.19.0产生engine警告，后续开发与检查已显式切回仓库规定Node24.14.1。npm报告60项审计问题，尚未区分既有和新增依赖；交付前需要审计，不执行破坏性的audit fix --force。

## 原生接线进度

RN根入口已接通导航、六类页面、前后台刷新、系统减少动态及偏好保存。GameSurface保留实例，非游戏页暂停；菜单和应用交互位于RN。Godot新增rn_scene入口，保留home/interior/courtyard实例，仅接收状态/场景/抚摸命令并输出低频状态事件。旧独立Godot入口未删除。

iOS WanpetPlatform使用NSURLSession拒绝重定向，限制响应2MiB，超时12秒；Android最初使用不跟随重定向的HttpURLConnection，最终交付改用现有 OkHttp 依赖并增加整个请求的 12 秒超时（见文末）。两端以私有原子文件保存待确认回执，不保存密码或token；随机键由系统密码学随机数产生。生产环境缺少HTTPS配置时拒绝启动，不能用开发loopback代替发布地址。

验证：TypeScript通过、页面/导航12项通过、会话9项通过。Godot4.7.2与匹配LibGodot的官方4.5.1场景桥接检查均通过；已修复纯场景模式未挂载按钮造成的泄漏。固定LibGodot4.5.1.migeran.2下载已按SHA256验证，lipo确认模拟器包含arm64和x86_64。独立资源项目仅拷贝22项实际引用素材并核对manifest，不共享4.7导入缓存。

CocoaPods安装完成（补充现代Ruby所需nkf依赖）；iOS原生编译进行中。尚未证明原生模块运行、Android编译、游戏资源在RN内成功显示或真实服务器全流程。JS测试mock游戏宿主，不冒充引擎验收。

可复现资源构建：Node24运行npm run mobile:prepare-game；MOBILE_GODOT_BIN可指定官方4.5.1编辑器。该阶段默认入口曾保留旧客户端；当前入口状态见文档开头。

## 原生构建依赖修复

将 react-native-worklets-core 1.6.2 声明为移动端直接依赖，确保 CocoaPods 自动链接其原生头文件。根据该版本 Worklets 插件源码，补齐它二次编译时直接引用的 Babel optional-chaining、nullish-coalescing 和 TypeScript preset；前两个 proposal 插件虽已弃用，但当前上游仍按这些包名加载，暂不能仅换包名。

本轮验证：CocoaPods 安装成功（75 Pods）；iOS Debug 模拟器 xcodebuild 返回 BUILD SUCCEEDED；iOS 正式 Metro bundle 成功并复制 5 项 RN 图片资源；类型检查与 mobile:test 通过。模拟器安装已发起，尚未确认完成或实际运行。以上不代表真机、Android、Godot 显示和端到端业务验收完成。

## 引擎生命周期与 Android 接线

修复场景初始化失败后已创建引擎未销毁，以及旧引擎销毁过程中再次挂载的竞争。新增 3 项引擎控制测试，验证失败后清理、等待销毁后重新启动、并发启动复用实例；这些是模拟原生调用的控制逻辑测试，不代表真实引擎运行。当前会话测试 10 项、组件/导航/引擎控制 15 项通过，TypeScript 和修改后的 iOS Metro 正式打包通过。

Android 使用已有 Android Studio 内置 JDK 和本机 SDK；首次构建因官方模板假设独立 node_modules 失败。已按当前 npm workspace 布局修正 Gradle 插件、React Native、Codegen、CLI 与 Godot 原生依赖路径，后续构建仍在运行，尚不能报告 Android 构建通过。iOS 模拟器安装命令仍存活且未返回，未重复启动安装。

设置页补充读取/保存期间的开关禁用和同步互斥，避免连续操作覆盖尚未确认的偏好；失败保留原值，成功清除本地错误。新增延迟写入失败测试，确认并发调用只写一次且失败后恢复交互。当前组件/导航/引擎测试 16 项通过，类型检查通过。

运行环境诊断：Android 已进入 app 配置，正在安装 NDK 27.1.12297006。iOS 安装进程采样确认等待 CoreSimulator 的 host_support_mig_install_app 调用，模拟器 SpringBoard 和 launchd_sim 均存活；尚无安装完成证据。

## RN 会话层真实后端验收

新增 `apps/mobile/test/live-session.test.ts`，显式设置 `MOBILE_TEST_API=http://127.0.0.1:3100/v1` 后执行 `npm run test:live -w @wanpet/mobile`。仅允许 loopback 地址，创建独立随机测试账号，以真实 HTTP 调用本地服务；没有修改服务器时钟或现有用户数据。

实测通过（约 61.7 秒）：注册与初始化、出发成功后模拟丢失回执、退出后重新建立 Session 并从文件恢复待确认记录、原键重试只扣一次库存、等待服务器归来状态、领取与收藏、改密撤销会话、新密码登录恢复收藏、退出。测试临时回执文件已清理，测试账号及其旅行账本保留在本地开发库中，最终会话已退出。

此结果验证 RN 使用的 Session 与真实后端协议兼容，不包含原生网络适配器、原生文件存储、页面触摸或 Godot 实际显示；这些仍需设备运行验收。

## 保留游戏能力的回归

运行 `npm run godot:check`，Godot 4.7.2 返回 87 项检查、零失败；已核对入口实际执行 `tests/check.gd`，覆盖素材完整性（四方向及生活动作保留 121 帧）、转向步态相位、资源边界、旧会话和页面行为。此检查证明保留的独立 Godot 入口未在已覆盖范围内退化，不等同于 LibGodot 嵌入运行验证。

Android NDK 27.1.12297006 已完成安装，构建进入 Godot/Worklets 模块配置。Metro `/status` 返回 `packager-status:running`。iOS bootstatus 表示设备已启动，但安装和应用容器查询均尚未返回，不能把 Booted 状态当作应用运行成功。

Android 运行准备：已启动现有 `Medium_Phone_API_36.1`，adb 显示 arm64 设备在线且 `sys.boot_completed=1`；已 reverse 8081（Metro）与 3100（本地后端）。构建因 Worklets 工具链默认值另需 NDK 27.0.12077973，当前自动安装中；尚无 APK 验收结果。

依赖审计初筛：`npm audit --omit=dev` 返回 32 项（24 high、8 moderate），上游传播根源为 braces、fast-xml-parser、sprintf-js 的 3 条公告。RN 的工具依赖仍可能出现在 omit-dev 图中，不能按此结果直接断言设备运行时可利用或无风险。当前构建期间未升级依赖；修复版本、兼容性和打包可达性仍待确认，不将审计标为通过。

离线恢复修复：成功读取快照且没有待确认写操作时清除旧 NETWORK 提示；存在待确认写操作时保留提示和原幂等键。新增回归通过，当前会话测试 11 项、组件/导航/引擎测试 16 项通过，类型检查通过。

Android 两个 NDK、Build Tools 36、Platform 36 已安装完成；Gradle 线程采样显示正在通过 HTTP 解析外部依赖元数据，构建仍未结束。

## Android 首次设备验收

原生构建首先在 Godot C++ 的 `AChoreographer_postFrameCallback64` 失败，该接口要求 API 29；将最低 Android 版本对齐为 29 后，arm64 Debug APK 构建成功并安装到 API 36 模拟器。实际 RN 登录/注册表单正常显示，控件树可读取，Metro 连接成功。

提交注册后进入游戏时发生 SIGSEGV：堆栈为 `AndroidThread::run → LibGodot::get_jni_env → JavaVM::AttachCurrentThread`，JavaVM 为空。对照桥接库官方 Android 示例与本地源码，确认 MainActivity 缺少 `RTNLibGodot.getInstance().init(this)`；已在 onCreate 补齐。修复后的原生构建与设备复验继续进行，不能将首次 APK 构建通过等同于 Godot 嵌入验收通过。

JNI 修复后，真实设备登录成功，Godot 4.5.1 引擎启动且未复现该崩溃。随后场景加载失败，日志指向 `.godot/exported` 资源缺失。对比发现导出目录有 27 个 `.godot` 文件，而 APK 为零；已按上游示例调整 aaptOptions，保留该目录。重建成功，新增 `scripts/check-rn-apk.py` 对 APK 的全部 69 个 Godot 文件逐个比对 SHA256，验证通过。场景显示仍需新 APK 设备复验。

完整资源 APK 的设备复验：RN 内庭廊首页和猫已实际显示；行囊选择/禁用状态、真实出发、服务器倒计时、归来前禁止领取、成功领取、奖励页及新增收藏全部通过实际点击和控件树验证。设置页开关切换后离开再进入仍保留选择；庭院入口成功显示场景和猫。尚未证明动画连续性、寻路触摸、跨进程偏好恢复、所有异常路径和 iOS 运行。

设备画面发现房间标签挤出边缘、浅底白色状态栏及 Godot 固定比例黑边。已修正 RN 标签容器弹性宽度、深色状态栏，以及独立 RN 场景项目的 stretch/aspect=expand。类型检查、11 项会话测试、16 项组件/导航/引擎测试通过，Godot 资源重建与桥接检查通过；新 APK 正在重建，视口修复需再次设备验收。

布局修复设备复验通过：庭院无黑色侧边，顶部房间标签完整且状态栏改为深色。持续运行检查发现中文 hint 事件导致 JSON 被截断，错误遮罩覆盖场景，故触摸与连续动画仍未验收。

根因已定位至 react-native-godot 1.0.1 的 NativeGodotModule.cpp：STRING 和 STRING_NAME 转换调用 createFromUtf8 时传字符数而非 UTF-8 字节数。新增 scripts/patch-rn-godot.mjs 并接入 postinstall，固定上游版本、校验唯一匹配、可重复执行；改用 utf8.length()/buffer.size()。补丁两次执行一致，Android 原生重建通过；真实中文事件与 iOS 原生编译尚需复验，未宣称该问题已通过运行验收。

UTF-8 修复设备复验通过：Android 庭院持续运行显示完整的“在家，自在休息”“正在散步”等提示，不再出现 JSON 截断遮罩；点击地面前后分时画面显示猫从门边走到庭院中部并改变朝向。切换小屋显示“在猫窝打盹”，进入后台再返回仍为同一进程、原房间与提示可用。分时截图在 `.tools/rn-qa/`；此证据尚不足以证明所有动画帧连续性或长期内存稳定性。

iOS 最新源码及 UTF-8 补丁在独立 DerivedData 编译通过。新建隔离模拟器 Wanpet-RN-QA，系统迁移完成后安装成功并启动应用，旧模拟器安装阻塞未在该设备复现。iOS 逐页及 Godot 嵌入运行验证继续进行。

## iOS 原生逐页验收

关闭签名的编译产物虽然能安装和显示 RN 表单，但 Godot 框架被 dyld 以无效签名拒绝加载。改用模拟器 ad-hoc 签名（CODE_SIGNING_ALLOWED=YES、CODE_SIGN_IDENTITY=-）重建；应用与框架 codesign --verify --strict 均通过，真实首页和动态猫显示正常。该结果只代表模拟器签名，不是 App Store 分发签名。

实际 UI 操作通过：登录、行囊选择与禁用、真实出发、60 秒服务器倒计时、归来前禁领、领取奖励、收藏新增、旅行期间首页隐藏猫、设置开关保存及返回保留、庭院显示、减少动态开启时仍可点击寻路、完整中文提示、退出返回登录页及同一进程再次登录重建 Godot 首页。iOS 和 Android 均已验证真实 HTTP 旅行闭环；尚需最终交付审计、入口/文档统一及剩余异常路径检查。

初始化错误提示修复：原生可能拒绝一个字符串而非 Error 对象，之前界面会显示 undefined；GameSurface 现在保留可用错误状态并向用户显示可操作的中文提示。新增该回归测试，当前会话 11 项、组件/导航/引擎 17 项通过，类型检查通过。

## 默认入口与交付检查

默认 `dev:client` 已切换为 RN Metro，新增 mobile:ios/mobile:android；原独立入口保留为 dev:godot。默认 typecheck 和 test 包含移动端；build 编译后端、构建隔离 Godot 资源并生成两端正式 JS bundle，不冒充原生签名包。README、架构边界、页面规划提示和移动端说明已同步。

完整命令链 `check:scaffold → typecheck → test → build` 成功：19 项必需文件/JSON、全仓类型检查、7 项后端单元测试、11 项 RN 会话测试、17 项 RN 组件/导航/引擎测试、87 项 Godot 检查及 iOS/Android 正式 JS bundle。最终两端原生构建通过，Android 69 项资源 SHA256 校验通过。

两端新增构建期 API 地址配置：Android Gradle 属性 wanpetApiBaseUrl/环境变量 WANPET_API_BASE_URL，iOS 同名 build setting 写入 Info.plist。Android 实测参数生成正确 BuildConfig，再恢复默认值构建；iOS 未指定参数生成空值，Debug 使用本地 API。Release 的 HTTPS 校验仍由 Session 执行；此项不是分发签名或生产部署。


## 最终交付结果

现有页面已按职责完成迁移，默认入口、构建、测试及文档已切为 RN。Godot 保留原猫与场景资产，完整 121 帧按原 24fps 资源使用；后端继续负责权威结算。

最终新增两项会话归属回归：首次快照须匹配登录用户名，后续快照及待确认回执须匹配当前玩家。错误玩家回执不能清除本地待确认记录；合法的旧幂等回执可确认，但不能覆盖较新快照。当前 RN 会话 13 项、组件/导航/引擎 17 项和类型检查通过；真实 HTTP 会话测试重新执行通过，覆盖丢失回执、退出重登、同键恢复、旅行领取和改密。

Android 网络改用 RN 已依赖的 OkHttp 4.9.2，增加整个请求 12 秒限制，保留禁重定向、2MiB 响应上限和 Release 禁明文地址。官方同版本 MockWebServer 提供本地真实 socket 测试：UTF-8 与请求头、禁重定向、无 Content-Length 的超限响应、持续慢响应总超时、Release 地址限制，加上只读连接恢复和写入不自动重放，共 7 项通过。早先测试夹具使用 JDK HttpServer，Android 测试编译不支持该 API；替换后原生测试和 APK 构建通过。

验证汇总：
- 通过：scaffold 19 项必需文件/JSON、全仓类型检查、后端 7 项单元测试、RN 30 项测试、Android 7 项网络测试、Godot 87 项检查、真实 HTTP 会话闭环。
- 通过：iOS 模拟器签名构建、Android arm64 Debug 构建、两端最终正式 JS bundle、APK 中 69 个 Godot 文件的 SHA256 对照。
- 通过：两端模拟器主要页面及真实旅行闭环、猫与场景显示和触摸；iOS 退出重登重新创建引擎、Android 前后台恢复。具体证据见前文。
- 未通过：依赖审计仍报告 32 项（omit-dev；24 high、8 moderate），涉及 braces、sprintf-js、fast-xml-parser 的工具依赖链。检查时前两者注册表最新版本仍无可用修复；未强制升级不兼容 RN 主版本，不声称设备运行时零风险。
- 未运行：物理设备、长期内存/耗电、逐帧播放性能、完整设备故障矩阵、此次迁移的全量数据库集成套件及商店分发。模拟器结果不代替这些检查。

未提交、推送、部署或发布。原独立 Godot 与旧 Web 客户端保留。


最终 Android 设备复验曾发现定时读取偶发 IOException；官方 OkHttp 文档明确指出关闭连接恢复会暴露过期池连接错误。增加 GET/HEAD 的连接恢复，写操作保留禁自动重放。MockWebServer 的 DISCONNECT_AFTER_REQUEST 模拟连接池迟发断连，读取恢复和写入不重放回归均通过。Debug 日志只记录异常类名，不含请求地址、正文或凭据。

修复包设备复验：重新安装并登录同一 QA 账号，首页及行囊显示正常；连续两个 35 秒观察窗口跨越自动刷新周期，当前进程没有新的原生网络错误、页面无连接错误提示。最终首页截图保存于 `.tools/rn-qa/android-final-home.png`。旧设备上两个挂起的本次 simctl 命令已终止，未重置或删除用户模拟器。
