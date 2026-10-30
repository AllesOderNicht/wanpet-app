---
name: 丸宠APP
description: 暖白与鼠尾草控件承托可独立走动的水彩宠物
colors:
  paper: "#fbfaf5"
  ink: "#3f4a40"
  secondary: "#687266"
  green: "#4d654f"
  wash: "#e7ecdd"
  white: "#fff"
  outline: "#adb9a3"
  outline-soft: "#dce2d5"
  selected-surface: "#f1f4ea"
  green-hover: "#3e5741"
  green-active: "#354b38"
  wash-hover: "#d9e2cc"
typography:
  headline:
    fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif'
    fontSize: "2rem"
    lineHeight: 1.25
    letterSpacing: ".015em"
  page-title:
    fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif'
    fontSize: "1.75rem"
    lineHeight: 1.25
    letterSpacing: ".015em"
  pet-title:
    fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif'
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif'
    fontSize: "1rem"
    lineHeight: 1.5
  action:
    fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif'
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif'
    fontSize: ".875rem"
    lineHeight: 1.5
rounded:
  soft: "12px"
  tile: "16px"
  pill: "24px"
  primary: "28px"
  circle: "50%"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    typography: "{typography.action}"
    rounded: "{rounded.primary}"
    padding: "12px 20px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  button-primary-active:
    backgroundColor: "{colors.green-active}"
  button-primary-disabled:
    backgroundColor: "{colors.outline-soft}"
    textColor: "{colors.secondary}"
  button-secondary:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.green}"
    rounded: "{rounded.pill}"
    padding: "10px 24px"
  button-secondary-hover:
    backgroundColor: "{colors.wash-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.green}"
    padding: "8px 0"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    padding: "10px"
    width: "44px"
    height: "44px"
  room-switch:
    backgroundColor: "#fbfaf5eb"
    rounded: "{rounded.pill}"
    padding: "2px"
  room-option-selected:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.green}"
    typography: "{typography.label}"
    rounded: "22px"
    padding: "8px 16px"
  status-chip:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.green}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 14px"
  inventory-tile:
    backgroundColor: "#fffdf8"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tile}"
    padding: "10px 5px"
  inventory-tile-selected:
    backgroundColor: "{colors.selected-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "9px 4px"
  navigation:
    backgroundColor: "{colors.white}"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    padding: "5px 16px max(5px, env(safe-area-inset-bottom))"
  walk-toggle:
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
---

# Design System: 丸宠APP

## Overview

**Creative North Star: "窗边小屋里的水彩陪伴"**

沿用已选定的清透日系绘本方向：暖白承托真实文字，鼠尾草绿承托操作，水彩材质属于场景、宠物和物品。界面像安静的绘本页，控件保持清晰、实色和可操作，不把整张设计稿当作界面。

这是对当前 React / PixiJS 网页实现的提取。原创三花猫是现有资源包，宠物活动层独立于静态场景；后续物种通过各自的动作、可见范围和锚点接入，不继承猫的身体结构。本文不把未实装的旅行、账号保存或在线 AI 生成为视觉状态。

当前实现为规范来源：[全局样式](apps/client/src/style.css)、[界面原语](apps/client/src/main.tsx)、[宠物活动层](apps/client/src/pets/PetStage.tsx)与[通用帧布局](apps/client/src/pets/model.ts)。产品约束见 [PRODUCT.md](PRODUCT.md)。已选美术和实色控件、字体交接见 [UI 设计规范](docs/ui-design-spec.md)；该文档中的未实现页面与提案数值不自动进入本系统。具体家园构图、功能范围和回顾性方向记录保留在[表面简报](apps/client/.impeccable/surfaces/apps-client-src-main-tsx.md)。

**Key Characteristics:**
- 暖白阅读面与克制的鼠尾草操作色。
- 水彩插画和独立文本、原生可访问控件并存。
- 单列移动容器、可滚动内容与不缩小的操作热区。
- 宠物以独立动作帧移动；减少动态效果时仍可直接定位。

## Colors

低饱和绿负责操作与状态，暖白负责阅读；天空色、木色、橘色和纸纹由插画自身提供，不扩成应用控件的附加色系。前置 tokens 保留实际 CSS 色值格式。侧文件中的八阶 OKLCH 色带仅是面板合成预览，不是代码中已有色阶，也不新增应用 token。

### Primary

- **鼠尾草操作绿（green）**：主操作、当前导航、选中边框、焦点环和原生复选框。深一阶 hover / active 只服务操作反馈。
- **浅鼠尾草洗色（wash）**：状态胶囊、次操作和场景选项；wash-hover 用于次操作悬停。

### Neutral

- **暖白纸面（paper）**：页面及阅读区；**纯白（white）**：底部导航、深色操作上的文字与勾号。
- **深灰绿墨色（ink）**：标题和主要正文；**次要灰绿（secondary）**：说明、数量、未选中导航和禁用文字。
- **鼠尾草轮廓（outline / outline-soft）**：空准备位虚线与库存浅描边；较浅轮廓色也用于禁用主操作。
- **选中浅面（selected-surface）**：填入的准备位与选中物品。状态同时使用结构标记，不能只靠此浅色区分。

**The Painted World, Clear Controls Rule.** 水彩的色彩、纹理和明暗留在美术中；正文阅读面和主操作保持干净、实色。不要给整屏再罩米黄滤镜。

## Typography

**Display Font / Body Font:** 共用平台系统栈，以 PingFang SC / Hiragino Sans GB 提供中文回退，无嵌入字体。没有另设装饰性展示字体。

**Character:** 清楚、平静的中文排版与手绘插画形成分工。层级由字号、字重和间距完成，控制文字保持原文，不生成图片字。

### Hierarchy

- **Headline**：家园主标题使用根字号的两倍（2rem），紧凑行高（1.25）与轻微字距（.015em）。h1 的粗体来自语义元素默认值，样式未另声明字重。
- **Page title**：普通页面标题收至（1.75rem），沿用 h1 的行高、字距和语义粗体。
- **Pet title**：同为（1.75rem），使用明确的中粗字重（600）与较松行高（1.4）；窄屏变体见 Layout。
- **Title**：分区标题（1.25rem / 600 / 1.4）。
- **Body / Action**：正文和主按钮（1rem / 1.5），主按钮加重至（600）。
- **Label**：状态、物品标签、帮助和导航（.875rem / 1.5）。数量使用等宽数字特性；说明按现有组件放宽行高（1.6–1.8）。

根字号为（16px），这组实际字号为 14 / 16 / 20 / 28 / 32px，没有固定几何倍率。前置 typography 仅列出已实现角色；未指定的字重遵循 HTML 元素和继承规则。

**The Live Text Rule.** 名称、状态、数量、导航和错误必须是实际文本；图片里的字形不成为字体规则。系统中文字体栈是已交接并已实现的选择。

## Layout

应用是居中的单列移动容器，宽度占可用空间、上限（480px）。外壳使用动态视口高度；内容区独立纵向滚动，使用 `min-height: 0` 和 overscroll containment，导航不被内容挤压。短屏通过滚动保留内容与热区，不能把完整页面硬压进首屏。

页面通常留水平边距（24px），重复间距集中于前置 spacing。两个已实现断点：宽度至少（800px）时，页面上下各留（24px），外壳高度扣除（48px）并增加圆角；宽度最多（350px）时，内容水平边距改为（20px），物品网格间距由（12px）收至（8px），宠物标题改为（1.5rem），物品格减少画面占用。导航和标题处理设备安全区。具体场景高度、画面裁切与家园上下结构属于表面简报及实现，不作为所有页面的固定构图。

## Elevation & Depth

深度主要来自水彩场景本身和干净的浅色面。界面没有一套悬浮卡片阴影；库存、准备位和状态用色面、细描边与留白分层。

### Shadow Vocabulary

- **外壳环境投影**（`0 12px 60px #3547320d`）：只用于移动应用外壳与外部画布的柔和分离。控件没有 hover 位移或新增投影。

**The Quiet Depth Rule.** 控件靠色面、描边、留白和选中标记建立层级；外壳的柔和投影不扩散成每个物品格的阴影。

## Shapes

圆润但不把所有内容装进胶囊。主操作采用长胶囊（28px），次操作和状态采用柔和胶囊（24px），物品格与桌面外壳采用圆角矩形（16px），轻型提示与导航 hover 使用较小圆角（12px）。返回与设置使用圆形（50%）。场景切换内层按钮是与外层相配的（22px）圆角，属于该组件的具体几何，不另扩为通用尺度。

物品默认描边（1px），选中描边（2px）加勾号。插画按照自己的透明轮廓显示；宠物不套统一圆形裁切。帧布局根据全部帧的可见范围和锚点计算四向外延，防止偏心或不同身体比例被裁断。

## Components

### Buttons

直接、柔和的实体操作，不叠加装饰性按钮框。

- **Primary:** 通栏操作绿底白字，内边距（12px 20px），最小高度（56px），圆角引用 primary；背景反馈为（160ms ease-out），hover / active 使用对应深绿。禁用改为浅轮廓色底、次要文字色。
- **Secondary:** 浅洗色底、操作绿文字，内边距（10px 24px），最小高度（48px），字重（600）；hover 使用 wash-hover，禁用保留文字并降低不透明度（.6）。
- **Text:** 透明底、操作绿、下划线，最小高度（44px），内边距（8px 0）；禁用去掉下划线并使用次要文字色。
- **Icon:** 返回与设置热区（44×44px），图形（26×26px），圆形透明底；hover 使用半透明洗色。线形图标使用实际 SVG 路径、圆端点和圆连接，不用字符代替。
- **Focus:** 按钮、输入、summary 和活动区都有（2px）操作绿焦点环；通常外偏（3px），宠物活动区向内偏（4px），避免被场景裁切。

### Chips / Segmented Controls

状态胶囊用浅洗色底和操作绿文字，内边距（5px 14px）；文案、图案与间隔点共同表达状态。它是信息，不伪装成按钮。

场景切换由半透明暖白外层包住两枚文字按钮，选中项用浅洗色和（600）字重，同时设置 `aria-pressed`。每项最小高度（44px），切换不移动控件热区。

### Cards / Containers

实际可复用容器是准备位和库存格，不是通用仪表盘卡片。两者使用相同圆角、三列流式网格和等比完整物品图；物品名与数量始终为图外文本。

准备位空态使用虚线和明确“待选择”；填入后使用浅选中面和实线。库存选中以加粗描边、勾号和 `aria-pressed` 表达，调整 padding 保持外形尺寸。不可用库存同时显示“数量不足”，图像的灰度与透明度只作补充。库存数量不得从这些展示图推断。

### Inputs / Fields

当前没有可见文本输入样式。自动散步使用原生复选框：家园框体（18px），设置框体（22px），绿色 accent / caret，标签点击热区至少（44px）。文件输入隐藏，由实际次按钮唤起；不能把隐藏 file input 当作已存在的上传拖放组件。

### Navigation

底部导航为白色底、等分文字入口。未选中使用次要文字和灰度美术；当前项用操作绿、中粗字重、正常美术和底部短线，同时设置 `aria-current`。条目最小高度（66px），导航最小高度为（76px）加底部安全区。插画图标按可见包围盒缩放到图形盒，完整保留标签；不能用整张透明画布的尺寸代替可见图形大小。

### Independent Pet Stage

静态场景和透明 PixiJS 活动层独立。宠物资源包分别提供 `idle`、`walkLeft`、`walkRight`，步行用连续独立帧；现有三花猫左右各六帧。每只宠物自己的 fps、速度、可见范围和锚点决定表现，不把当前猫的数值升级为所有物种的 token。

点击和方向键都能设定边界内的目标点；Enter / 空格回到横向中心。自动散步可关闭，前后台切换会暂停/恢复渲染。遵循系统减少动态效果：自动散步关闭，待机/行走帧停止推进，点击或键盘直接移动到目标；CSS 同时取消 transitions，并使滚动不使用平滑动画。设置和状态文字保留反馈，不强迫用户看运动才能理解状态。

### Preview / Error Feedback

本地行囊操作明确说明不消耗物品、不保存至账号；旅行和收藏显示未开放说明。导入错误使用真实文字和 alert；场景加载失败提供重试。不要把当前的本地交互表述为服务器完成状态。通用资源动作不依赖物种，但当前加载和渲染错误文案仍有“小猫”措辞，应视为后续文案适配点。

## Do's and Don'ts

### Do:
- **Do** 保持暖白阅读面、鼠尾草实色操作和插画自身的水彩材质。
- **Do** 使用真实文字、可访问名称、键盘焦点以及至少 44px 的操作热区。
- **Do** 用描边、勾号或下划线补充颜色状态，并保留“数量不足”等明确文字。
- **Do** 让小屏和长内容滚动；按资源包的全部帧、可见范围和锚点适配宠物。
- **Do** 跟随系统减少动态效果，保留文本反馈与即时定位。
- **Do** 在演示数据和未接入能力旁保留清楚的预览或未开放说明。

### Don't:
- **Don't** 把整张画面截图当作交互层，或让插画降低正文和操作的可读性。
- **Don't** 为适配短屏缩小文字、物品标签或操作热区。
- **Don't** 用强阴影、装饰性卡片堆叠或满屏滤镜覆盖现有的轻盈层级。
- **Don't** 用单张立绘平移替代步行动作，或把猫的骨骼、翻转复用当作通用宠物规则。
- **Don't** 在本地搭配成功时伪装成账号已保存、道具已消耗或真实旅行已开始。

未固化为系统规则：设计交接中的艺术辅助色、未实装页面参数、一次性的装饰值和 12px“互动预览”小标签均未扩成通用 token；当前“小猫”加载/错误措辞也未固化为跨物种文案。系统字体已被明确交接，因此不将它误记为需要替换的展示字体缺陷。
