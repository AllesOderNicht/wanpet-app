---
version: 1
slug: "apps-client-src-main-tsx"
primary_target: "apps/client/src/main.tsx"
related_targets: ["apps/client/src/pets/PetStage.tsx"]
---

# 家园互动预览

范围：沿用用户已选的第一张窗边水彩图做功能增量，访客模式为 Experience。主要任务是看宠物自然走动、点击活动区移动，以及在设置中导入其他宠物的本地动作包。

本轮未替换视觉身份、未重跑概念轮，没有 seed key 或 QUALITY BAR 卡片。以下契约在实现后据现有事实补记，不能作为历史审批记录。已选图像见 assets/ui/screens/home-v2.png；当前截图和浏览器验证见 .impeccable/review/。

THESIS: A living watercolor pet room. The pet changes gait frames while walking to a point.
OWN-WORLD: Warm white, sage controls, watercolor room and illustrated inventory; real interface text.
STORY: Watch, move, pause and replace the pet; preview a three-item bag with no account writes.
FIRST VIEWPORT: Window room dominates the upper mobile screen; walking pet rests on the rug, room switch above, pet status and bag action below, three-tab navigation at the bottom. Short screens scroll.
FORM: Existing selected mobile home composition, adapted for a clear walking area. Incremental extension; no concept rank or seed key applies.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

动作验收：左右独立动作帧、暂停/自动漫步、键盘与点击、边界限制、减少动态效果、替换与卸载清理。导入包使用通用 metadata，不写死猫骨骼。

数据约束：行囊与库存明确标注预览；旅行和收藏使用真实未接入状态。此页不接账号经济、奖励发放或保存 API。

未决事项：在线 AI 生成提供方、AI 动作质量验收、服务端物种与存档接入、iOS 真机性能。当前不承诺它们已完成。
