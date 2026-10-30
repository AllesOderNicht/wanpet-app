# 可替换宠物动作与家园互动

> 2026-10-17 Godot 迁移：当前正式客户端、资源格式和验收边界见 [Godot 开发说明](godot-development.md) 与 [迁移记录](godot-migration.md)。下文 React/PixiJS/Capacitor 和 v1 导入相关内容保留为此前阶段记录，不表示当前交付技术栈。

日期：2026-10-17。本次把已选“窗边小屋”做成可运行的 2D 家园预览。三花猫能自动散步、点击移动、方向键移动和停留；行走使用左右各六帧的腿部动作，位置推进与换帧分别处理。后续宠物通过动作资源包替换，不要求共用猫的骨骼。

## 当前可以体验

- 小屋/庭院切换、地毯范围内的散步、自动散步开关。
- 家园→行囊搭配→已备好；三个位置、库存不足、选择保留。行囊明确使用体验数据，不写入账号、不扣物品，也不会触发真实出发。
- 设置→导入宠物，同时选一份 JSON 与配套 PNG/WebP；导入失败保留当前宠物，可以恢复三花猫。仅在当前页面会话内使用，刷新后回到默认宠物；不上传文件。
- 旅途和收藏提供真实的未开放空态，没有模拟倒计时或奖励发放。
- 跟随系统减少动态效果：自动散步关闭，主动指定位置直接到达。键盘方向键移动，Enter/空格回到活动区中心；隐藏页面停止渲染器。

启动：在仓库根目录运行 `npm run dev -w @wanpet/client -- --host 127.0.0.1 --port 5173`，打开本地页面。正式 iOS 工程、登录接入、服务端准备契约、旅行和在线 AI 生成不在这次完成范围。

## 通用动作资源包 v1

示例：[assets/pets/calico-v1/pet.json](../assets/pets/calico-v1/pet.json)。将它与同目录三张 WebP 一起选择，即可导入。只想替换物种时，无需修改 React 页面或运动控制器。

| 字段 | 含义 |
|---|---|
| version | 固定 1，未知版本拒绝 |
| id/name/species | 本地视觉资源标识、显示名和物种说明；不是服务器玩家/宠物 ID |
| displayHeight | 可见角色高度，60–200 个家园逻辑单位 |
| speed | 本地表现速度，20–120 单位/秒；不决定旅程时长 |
| textures | 纹理 ID 到 file、width、height 的映射 |
| clips.idle | 至少一帧待机，可扩展多帧 |
| clips.walkLeft / walkRight | 左右移动各 4–32 帧，分别绘制；可表现走、跳或其他适合该宠物的移动 |
| clip.fps | 1–24，三花猫行走为 8 |
| frame.texture | 引用 textures 中的 ID |
| frame.rect | 图集中的 [x,y,width,height]，整数像素；也可引用整张独立帧图 |
| frame.bounds | 相对该帧的可见包围盒 [x,y,width,height]，用于统一视觉大小 |
| frame.anchor | 相对完整帧的归一化 [x,y]，落脚/落地点；范围 0–1 |

引擎以 390 单位宽的家园空间移动，将动作帧落脚点放到相同世界坐标。帧尺寸、锚点与可见范围允许不同，因此不要求 AI 精确生成等格、同尺寸、同骨骼的素材。对于长身体或大尾巴，图形宽度上限为 240 逻辑单位，并据此缩小可活动区域，防止角色伸出屏幕。

单张立绘只能提供静态待机。要获得可信步行，AI 必须输出连续动作图集或逐帧图片，腿、翅膀或身体姿态应变化；把同一立绘平移不能替代动作生成。左、右方向各自提供，避免翻转三花猫花纹。渲染器没有物种判断、腿数量或身体部件名称。

## AI 资产生成与整理流程

1. 先确定角色身份参考，锁定轮廓、花纹与配饰；保持已选水彩风格。不同宠物可以有不同身体结构。
2. 输出透明背景待机与左右连续移动帧。每帧保持角色比例、视角和花纹，空出脚、尾巴与耳朵边界；移动帧在原地循环，位移交给引擎。
3. 检查肢体变化与循环接缝，登记每帧实际 rect/bounds/anchor。生成式图集的格子可能不精确，不能只按等宽切格就认定可用。
4. 导出静态 PNG/WebP，填写 pet.json，经过运行时结构/尺寸/透明度校验后，在家园里检查左右移动和停留切换。
5. 在 assets/manifest.json 登记来源、AI 状态、提示词、引用图、哈希与审核状态。正式接入服务端物种目录是独立步骤。

本次左右图集均单独通过内置 image_gen 生成，原 PNG 与逐图提示词保留。各六帧像素哈希不同，并人工检查了腿部姿态；左向下排的一处尾巴跨过名义网格，资源包使用实际 x=522 的帧分界，未修改原图。脚底位置按实际 alpha 包围盒注册，处理上下排基线差异。

示例包只是静态贴图加运行时动作系统，不是 3D 模型、完整骨骼、自动绑定服务或已经接通的在线 AI 流水线。AI 生成任何外观后仍需产出动作并做视觉验收；结构校验不能判断每只宠物的解剖是否正确。

## 导入边界

最多 8 张纹理及一份 JSON，总计 24MiB；单图不超过 12MiB，JSON 不超过 128KiB。一起选择时会忽略记录图片来源的 .png.json / .webp.json 旁车文件。纹理单边不超过 2048px，像素总量不超过 16,777,216。仅接受本地 PNG/WebP 文件名；拒绝远程 URL、路径跳转、SVG 和动画 WebP。不执行脚本或插件。

在解码前读取 PNG/WebP 文件头，验证实际尺寸与声明一致；解码后复核尺寸，并在 64×64 采样中检查透明区和可见角色。逐帧坐标、锚点、图集范围与行走帧数量进行运行时校验。采样是基本筛查，不能替代边缘和动作质量检查。临时对象 URL、独立纹理和渲染器在替换/离开时释放。

## 代码边界

- [model.ts](../apps/client/src/pets/model.ts)：资源格式校验、边界约束、基于时间的位移、动作采样；不依赖 React/PixiJS。
- [load.ts](../apps/client/src/pets/load.ts)：默认包与本地文件读取、真实图片校验。
- [PetStage.tsx](../apps/client/src/pets/PetStage.tsx)：私有 PixiJS 渲染器、纹理帧、输入、resize 与生命周期。渲染最高 30fps，动作 8fps；换帧按移动距离同步，长帧推进最多 80ms，后台暂停。
- [main.tsx](../apps/client/src/main.tsx)：页面和预览行囊。演示数据不映射 test_food/test_supply，不连接后端经济。
- [pet.test.mjs](../apps/client/test/pet.test.mjs)：资源边界、不同物种/帧数、非法输入、图像文件头、帧采样与移动校验。

当前活动区域是无障碍物的地毯矩形，没有寻路、碰撞地图或跳跃物理。边界按全部帧的可见范围与锚点计算四向外延；外延并集过大时统一缩放，保留至少 48×24 逻辑像素的移动范围，避免偏心或顶部锚点造成裁切。后续需要复杂房间布局时，再扩展场景导航区域。

PixiJS 初始化与帧纹理使用已安装的 8.22.0 API，并核对 [Application 官方文档](https://pixijs.com/8.x/guides/components/application)。WebP 文件头按 [官方容器规范](https://developers.google.com/speed/webp/docs/riff_container)读取，兼容 VP8X、VP8L 与 VP8。

## 验收

scaffold、全仓类型检查、构建、客户端 12 项和服务端 4 项单元测试已通过。浏览器操作与布局记录写在 [.impeccable/review/browser-validation.json](../.impeccable/review/browser-validation.json)，截图为同目录 mobile / small / desktop 等文件。hero-repro.png 是在 853×1844 视口补捕的当前实现对照证据，保留 480px 容器，未缩放截图，不能代替历史检查点。动作资源验证见 [pet-animation-validation.json](../assets/review/pet-animation-validation.json)。

独立审阅先列出通用锚点边界与原视口截图两项修复；[复核记录](../.impeccable/review/verdict-pass.md)将两项都评为 resolved，disposition 为 ship。此结论仅评分这两项修复；初始完整审阅及输入限制见 [finish-review.md](../.impeccable/review/finish-review.md)，不代表整款游戏或 iOS 上线验收。

未运行数据库集成与 iOS 真机测试；本次不修改数据库或部署。浏览器通过不代表真机性能、VoiceOver、App Store 上线或任意 AI 动作质量已验收。


## 2026-10-18 生活动作更新

进食、抚摸与睡眠全部接入 24 帧原生精灵动画；见 `design/2026-10-18-ui-study/life24/README.md`。新图集位于 `assets/godot/pets/life24/`，睡眠复用 `engawa/cat-idle-24.png`。


## 2026-10-19 四方向视频行走

正式行走已替换为四方向各121帧视频抠图。源24fps、保留全部帧，周期与位移匹配信息及验证边界见 `assets/video/four-direction-v1/README.md`。旧24帧行走说明仅为历史记录。


生活动作也已切换为各121帧完整视频源。完整播放计时、重复抚摸重播及验证边界见 `assets/video/life-actions-v1/README.md`。旧24帧说明为历史记录。
