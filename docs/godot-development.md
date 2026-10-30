# Godot 客户端开发与本地验收

2026-10-17。正式客户端为 Godot 4.7.2 stable、GDScript、Compatibility；原 React/PixiJS 预览保留在 apps/client，通过 dev:legacy 启动。后端和公开协议不迁移到游戏引擎。

## 工具

本工作区已下载并校验官方 Godot macOS Universal 包，路径为 .tools/godot/Godot.app。通过 SHA512-SUMS.txt 校验压缩包；实际版本为 4.7.2.stable.official.ed1daf0bf。同版 macOS/iOS 导出模板已安装至用户的标准 Godot 模板目录。下载来源是 godotengine/godot-builds 的 4.7.2-stable Release，不运行远程安装脚本。

新机器从 https://godotengine.org/download/macos/ 或对应官方 Release 取得相同版本，校验 SHA512 后解压到 .tools/godot，或设置 GODOT_BIN 为自己的 Godot 可执行文件绝对路径。Editor → Manage Export Templates 安装同版本模板。Node 使用 .nvmrc 的 24.14.1。

~~~sh
npm run check:scaffold
npm run godot:check
npm run dev:client
npm run godot:editor
npm run godot:build
~~~

启动脚本验证引擎版本、资源来源字段及 SHA256，并从 assets/godot 同步所用图片到 apps/godot/assets。不要直接编辑生成副本。Godot 导入产物、引擎包、导出包、测试凭据和本地报告均被 Git 忽略。引擎输出 ERROR 即使进程退出码为 0，也会使检查/导出脚本失败。

## 本地后端

Godot 默认连接 http://127.0.0.1:3100/v1；通过 WANPET_API_BASE_URL 覆盖。仅调试构建允许 loopback HTTP，其他地址要求 HTTPS；禁止关闭 TLS 校验。正式 iOS 的 HTTPS 服务和签名尚未交付。

本次本机新增两个独立数据库：wanpet_test_godot 用于会临时创建故障触发器的集成测试；wanpet_test_godotplay 用于可视化操作与测试存档。数据库注释标记本任务归属，不访问原有其他数据库。本机 PostgreSQL 为 14.18；CI 配置为 PostgreSQL 17，CI 尚未推送运行。

本机专用连接配置已写入被 Git 忽略的 .env.godot。以后可直接运行 npm run dev:server:godot 启动这一独立测试后端；不要与已在 3100 端口运行的同一服务重复启动。

以你自己的数据库连接配置 DATABASE_URL，再执行：

~~~sh
npm run db:generate
npm run db:deploy
npm run build:backend
NODE_ENV=development HOST=127.0.0.1 PORT=3100 CLIENT_ORIGIN=http://localhost:5173 node apps/server/dist/main.js
~~~

集成测试必须额外提供 TEST_DATABASE_URL，且数据库名符合 wanpet_test 或 wanpet_test_后缀。不得指向实际存档库。CLIENT_ORIGIN 仍需符合已有后端配置；Godot 原生请求不伪造浏览器 Origin。

## 美术与场景

两个场景 JSON 是布局唯一来源。背景只是空房间/院子底层，家具、猫窝、食盆、植物及前景使用透明图集中的独立区域。修改物件位置会同时改变绘制位置和其碰撞轮廓；导航根据可走轮廓减去障碍后，按宠物半径烘焙。世界层按落地点 Y 排序；背景/前景固定层级。

PetPack v2 提供四方向待机与各24帧行走（18 fps，32单位/秒），以及睡觉、进食、抚摸回应。各帧分别注册脚底锚点，运行时使用固定角色比例。原 v1 本地导入入口未移植到正式界面。首版只有三花猫，画面外观不改变服务器的 test_species 身份。

全部来源与生成简述见 assets/godot/manifest.json，帧边界与像素哈希记录见 assets/review/godot/frames.json。首次生成的三行动作合图因边缘裁切未采用，保留在 review 中；正式版本使用独立动作图集。像素哈希差异不能代替动作视觉检查。

## 页面与数据

注册登录后加载账号快照，仅在 PLAYER_NOT_INITIALIZED 时初始化。每次启动重新登录，令牌不落盘；退出请求成功或服务端确认令牌失效后清理会话。

待确认经济请求先将账号、操作、请求体和幂等键写入本机请求记录，再发送。文件按服务地址和账号隔离，不含令牌/密码。未知结果保留原键；网络恢复后核对快照并由用户重试。客户端不乐观增加/扣减资产。更低 revision 和相同 revision 的旧 serverNow 不覆盖当前数据；相同 revision 的新 serverNow 可以推进旅行展示状态。

游戏始终显示服务器昵称、库存和收藏，测试目录只负责名称映射。首页已接入檐下场景与24帧透明猫：行囊、收藏和庭院是画面中的真实入口，菜单提供旅途、小屋活动和设置。子页面保留家园、行囊、旅途、收藏导航及返回家园。原小屋/庭院的寻路、进食和猫窝互动保留在活动页。旅行仅使用已有 60 秒测试规则；真实自主出发、聊天和在线 AI 后续实现。进食、睡眠和抚摸不会调用消费接口。

## 验证与产物

Godot 检查覆盖资源、导航、原生页面构造、快照乱序、不同账号请求隔离、持久同键重试和本地时钟不能授权领取。真实图形验收脚本为 tests/acceptance.gd，连接独立本地后端；--soak 附加实际 15 分钟循环。脚本会创建仅用于此本地库的测试账号，凭据保存于 Git 忽略的 .private 目录。

~~~sh
.tools/godot/Godot.app/Contents/MacOS/Godot --path apps/godot --script res://tests/acceptance.gd -- --soak
~~~

截图、原始动画帧和报告写入 apps/godot/.private/acceptance。Mac 导出位于 apps/godot/exports/Wanpet.zip，是用于本地测试的调试包，不是已公证的正式发行。iOS 导出预设特意留空团队与 Bundle ID，未进行 iPhone 真机或 App Store 验收。

## 2026-10-18 首页重构验收

EngawaHome 已由 main.gd 正式挂载，不再只是独立预览。主页不再叠加旧页头和底部导航；离线恢复提示覆盖显示而不压缩构图。旅行状态由服务器快照决定猫是否在家，减少动效和应用失焦暂停动画。

24帧图集使用 AnimatedSprite2D；旧房间行走新增方向滞回、转向步态相位保持、实际移动速度驱动播放倍率。四方向行走已在后续验收中替换为每方向24帧；重绘与偏移场景导航修复见 design/2026-10-18-ui-study/walk24/README.md。

验证：75项 Godot 回归、34项真实本机后端图形验收、16项视口指针交互检查通过；后者覆盖主入口、菜单、返回、离线状态和小屏触区。截图见 assets/review/engawa-integration。macOS本地调试包为 apps/godot/exports/Wanpet-engawa.zip，未公证、未发布、未做iOS真机验证。

2026-10-18 行走升级：新增可选 clip.scale 表示图集像素密度倍率，必须为有限正数且不超过8；不随动画帧变化缩放角色。新图集采用实际透明间距切分，避免尾巴/脚裁切。80项Godot回归和17项图形行走专项通过。导航目标与下一路径点统一使用全局坐标，并验证非零位置的房间。
