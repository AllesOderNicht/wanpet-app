disposition: fix

输入限制：未提供 QUALITY BAR 卡片，不能据卡片评定额外风格上限；本轮是既有已选构图的功能增量，surface brief 明确不重新执行概念 seed 轮。未重跑 detector；未查看未提供的真机或运行时截图。hero-repro.png 缺失见 persistence。

## persistence

fail — PRODUCT.md 已存在；docs/ui-art-production.md 留有用户“第一张”与 home_window_v1 的选择对应，docs/ui-design-spec.md 指定 home-v2.png 为交接基线；本轮 surface brief 如实标注实现后补记，不伪造历史审批。仓库本轮开始前无 DESIGN.md，故当前缺失不作缺陷。缺少 `.impeccable/review/hero-repro.png`，未提供在已选图自身 853×1844 尺寸下的真实实现检查点，不能声称完成该项复现证明。

## fidelity

提供的 desktop / mobile / small / bag-mobile / walk-left / walk-right 均为有效截图，无空白或损坏；小屏显示的是可滚动的短视口，符合本轮 brief 的明确适配约定。

| 元素 | 判定 | 依据 |
|---|---|---|
| 窗户、薄帘、木桌、书本、花草、右侧木凳与织毯 | match | 当前移动端仍以同一暖光水彩房间为主画面，材料和空间叙事成立。 |
| 三花猫与绿色头巾 | adaptation | 从大幅坐姿插画改为独立角色与留出的活动区，直接对应用户“猫应该是可走动的”；左右截图呈独立侧身动作，源代码使用左右各六帧。 |
| 猫旁静态行囊 | adaptation | 为明确的可行走地毯腾出空间；行囊图形保留在下方同名主操作，符合本轮 FORM 的 clear walking area。 |
| 标志、家园标题、右上设置与三项底部导航 | match | 阅读次序、入口数量与图形语义保留；新增小屋/庭院切换属于本轮明确范围。 |
| 身份、在家状态、准备状态、绿色行囊主操作 | adaptation | 结构保持；按钮按 docs/ui-design-spec.md 的 56pt 实色底和真实文字实现，满足交接记录的对比度与交互要求。 |
| TYPE | adaptation | 生成图夸张字形变为系统中文文字；docs/ui-design-spec.md 与 ui-art-production.md 已明确指定该字体栈及“生成图中的字形不是最终运行时字体”，不是本轮擅自替换展示字体。 |
| MATERIAL | match | 房间、宠物、导航与道具均为可见的真实水彩位图；没有 CSS 渐变或矢量假装水彩场景。实色控件由既有交接规范明确要求。 |
| GROUND | adaptation | 已选图文本区趋近白色，当前为轻暖白；当前 CSS #FBFAF5 与既有交接 paper token 一致，导航仍为白色。未发现额外米黄罩染。 |
| 预览标记、自动散步和资源导入 | adaptation | 均为本轮 STORY 的真实交互和数据边界，未添加商业主张或伪造真实旅行状态。 |

## ceiling

已使用水彩窗光、纸面留白、织物和木质材料、透明角色及实际步行动作。QUALITY BAR 卡片缺失，无法比较卡片特有的额外原生装置；本轮已选世界未出现要求重建的焦点材料冲突。THESIS、OWN-WORLD、STORY、FIRST VIEWPORT 与既有 FORM 在所见截图和所读源文件中成立，但通用动作包的边界承诺存在下述实际缺陷。预览数据有明确标签；旅途和收藏如实为空态；没有将本地包导入称为已接通 AI 生成。所见页面未触发 craft floor 的眉题、emoji 图标、硬阴影、装饰玻璃或渐变文字问题。

## material_fixes

1. [Contract / 通用动作包边界] 修正 `apps/client/src/pets/PetStage.tsx:55-80`：当前按可见宽度一半限制中心，实际 sprite 却使用任意合法 anchor，偏心/顶部 anchor 的宠物会被左右或底部裁掉。按全部帧的 bounds、rect、anchor 与实际缩放计算四向外延；外延并集大于可用区域时统一缩放并保持非空可移动区。补偏心 anchor 及上下方向的回归证据。
2. [Persistence / 复现证明] 补 `.impeccable/review/hero-repro.png`：在参考自身 853×1844 视口真实捕获当前实现，保留既有桌面容器适配，不放大截图冒充渲染；明确它是当前补捕的对照证据，不能补造历史检查点。

## keep

保留独立的水彩房间与真实换帧步行、左右花纹、物种无关的动作包、键盘/减少动态效果及诚实的本地预览数据边界。
