# 24 帧透明精灵动画

状态更新：正式首页接入、四方向行走与生活动作已完成后续实现。下文保留当时素材制作阶段的记录；当前接入证据见 INTEGRATION.md、walk24/README.md 与 life24/README.md。

当前版本取代前两版原画区域形变方案。用户明确要求抠出猫、制作 24 帧 Sprite Sheet。

- 图集：assets/godot/engawa/cat-idle-24.png，RGBA 1536×1024，6 列×4 行，每格 256×256。
- 配置：apps/godot/data/engawa-pet.json，24 个矩形和前爪锚点，8 fps；首尾短暂停留，一循环约3.5秒。24 帧指独立姿态数量，不是视频帧率。
- 动作：耳朵向外轻抖并回正，左侧卷尾抬起、缓慢回落。修正过第四行的尾巴突降，保留24个独立姿态。
- 渲染：EngawaHome 使用 AnimatedSprite2D + SpriteFrames + AtlasTexture。猫不再使用原图区域或形变材质；旧 engawa_cat.gdshader 已删除。背景底板混合材质只负责无猫背景，不参与猫动作。
- 对齐：每帧前爪基线在图集中有少量位置差，通过 JSON 锚点固定到同一场景落点；显示范围按选定图一校准。

来源：内置 imagegen，以选定图一及其抠图参考生成，随后修正尾巴衔接。完整提示词保存在 sprite24-prompts.json。生成动画帧含重绘，因此不能宣称猫纹理与原图逐像素相同；与之前保留原图像素的形变版本不同。

验证：24个切片哈希均不同；含真实透明通道；Godot 导入完成。engawa_preview.gd 检查 AnimatedSprite2D、24帧、猫材质为空、实际时间推进换帧、点击重播、减少动态暂停、离家隐藏及返回恢复，全部通过。查看整张图集及实际静止/扬尾渲染帧，确认不再是地板随猫一起扭动。git diff --check 通过。

预览：01-engawa-sprite24.gif / 01-engawa-sprite24.mp4，由 Godot 的实际输出编码，8秒。视频以30fps呈现8fps的精灵换帧，不会伪造额外绘制帧。

正式主场景接入及四方向行走仍未交付，此次完成的是图一趴卧耳尾动作的24帧资源及 Godot 预览。


保真第二版更新：当前首页与睡眠已使用 cat-idle-24-v2.png，采用实际透明间隙的可变切片；旧文中的固定256切片说明只适用于第一版。参见 fidelity-v2/README.md。
