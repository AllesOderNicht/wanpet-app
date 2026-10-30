# 阁楼小屋与桌边动作试玩

2026-10-30。使用现有 React Native + Godot 4.5.1 实现。小屋按用户参考图的双层木屋布局重新绘制，保留项目三花猫。本轮已完成可运行的本地试玩，视觉复核结论为 **ship**。

## 怎么试

在仓库目录运行 `npm run loft:preview`。窗口会先走完一次动作检查，然后出现「坐一会儿」「趴在桌边」「下来走走」三个按钮。这是本地动作试玩，不连接账号、不写存档。

可直接查看[动作录像](../.impeccable/review/loft/table-demo.mp4)：由 178 张实际 Godot 画面组成，390×844，10 fps，约 17.8 秒。

移动端接入：点击小屋圆桌会沿现有生活接口发出看书邀请；也可以从「状态 → 邀请它看绘本」触发。服务端接受并确认到达后，猫才会入座。阅读动画包含坐着、眨眼、低头、伏在前爪上的循环。收到下一个走动活动时先离座，再寻路。

## 实现范围

- 新室内背景：阁楼床铺、圆窗、楼梯、柜子、炉灶和苔绿色地毯。
- 圆桌、椅子、猫分别渲染，桌椅脚占地参与避障。
- 角色身体与前爪分层，让前爪落在桌面上；椅子前沿遮挡下半身。
- 四个绘制姿势，以可变帧时长组成循环；入座和离座使用短距离位移过渡。
- 吃喝、猫砂盆、猫窝随房间布局调整；庭院保留原场景与原阅读动作。
- 减少动态效果时跳过位移过渡；旅行离家、取消行为时清理过渡。

上层阁楼和楼梯目前是背景，猫只在下层地面活动。这版适配固定三花猫和固定桌椅，不是任意宠物自动适配家具。四个关键姿势也不等同于完整骨骼或逐帧入座动画。

## 素材来源

素材保存在 `assets/godot/loft/`：`room-v1.png` 为背景，`furniture-v1.png` 为桌椅图集，`cat-table-v1.png` 为桌边姿势图集。使用内置 imagegen 生成，原始生成图未作像素编辑。精确提示词保存在 `assets/prompts/loft-*.txt`，并嵌入 PNG 元数据；来源登记在 `assets/manifest.json` 与 `assets/godot/manifest.json`。运行时通过图集区域切分与锚点对齐。

## 视觉复核

实际渲染证据位于 `.impeccable/review/loft/`。`phone-sit.png`、`phone-blink.png`、`phone-lowering.png`、`phone-lean.png` 记录四个姿势；`phone-exit.png`、`phone-handoff.png`、`phone-away.png` 记录离座、过渡与回到地面；`large-phone-lean.png` 记录 430×932 视口。这里的 `away` 指离开椅子，不代表外出旅行。

[完整审查](../.impeccable/review/loft/review.md)确认了坐垫承重、前爪与桌面的接触、下半身遮挡、四姿势辨识度以及两种竖屏尺寸的布局，并发现离座交接时短暂弹回座位的问题 F1。修复保留了淡出姿势的实际位移；[定向复核](../.impeccable/review/loft/verdict.md)检查离座连续帧和共用逻辑的入座帧，确认 F1 已解决，结论为 ship。该复核只关闭 F1，其他视觉结论沿用完整审查。

截图和录像均来自桌面 Godot 的手机尺寸视口，不是真机或模拟器截图。10 fps 采样可以确认位置衔接，不能证明实际运行帧率下的流畅度、手机触控、安全区或真机性能。

## 验证结果

本轮已通过：

| 检查 | 结果 |
| --- | --- |
| `npm run check:scaffold` | 通过 |
| `npm run mobile:typecheck` | 通过 |
| 移动端 Engine/App 定向测试 | 24 项通过 |
| Godot `rn_bridge`、`cat_life`、新增 `loft_table` 测试 | 随 `mobile:prepare-game` 通过，包含最终 F1 修复后的重跑 |
| `npm run mobile:prepare-game` | 最终重跑通过；暂存脚本和室内配置与当前源码的 SHA256 一致，iOS/Android 游戏资源已更新 |
| iOS/Android JS bundle 生成 | 通过，当前本地产物已更新 |

本轮未运行手机安装、真机试玩及整仓后端/数据库集成回归。游戏资源和 JS bundle 生成不等同于原生签名构建或手机验收。当前可交付范围是本地试玩与已更新的移动端本地资源。


## 本轮 iPhone 安装（2026-10-30）

已用现有团队 Z6825T89G5 和原 Bundle ID `com.wanpet.playtest` 构建签名 Release 包，并覆盖安装到已连接的 iPhone 15 Pro Max（御坂网络）。没有卸载应用或主动清除数据。安装前已核对内嵌 Godot 包与当前源包 SHA256 一致、JS bundle 存在，以及云端 API 地址保持原值。

启动命令成功，两次设备进程检查均存在同一 WanpetMobile 进程（PID 65326）。这证明安装、启动及短时运行通过；手机里的实际画面、桌边触摸和账号登录状态尚未做屏幕验收。日志位于 `.tools/loft-iphone-20261030/`。
