# 丸宠APP

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

安静陪伴、准备行囊、宠物自主旅行、归来收集。目标通过 Capacitor 包装为 iOS 应用；当前执行与验收对象为 React 网页，尚未生成正式 iOS 工程。

## Capabilities and Constraints

现有后端实现账号、会话、测试初始化、权威快照，以及测试配置下的出发、幂等领取、账本与收藏。正式自主出发调度和客户端账号玩法尚未接入。经济和存档以服务端事务为准，界面预览不能伪造真实发奖或扣物品。

用户要求宠物可在场景中走动，并计划后续由 AI 生成不同宠物。用户已明确选择继续 2D 水彩动画，采用可替换的动作资源包；单张立绘不能直接作为完整步行动画。具体 AI 供应商和在线生成服务未确定。

## Brand Commitments

原创三花猫、清透日系绘本、第一张“窗边小屋”家园。具体地域世界观、猫咪正式名字和商业化未定。不得复制其他商业游戏角色或素材。

## Evidence on Hand

docs/ui-design-spec.md、assets/ui/screens/home-v2.png、assets/manifest.json、docs/travel-backend.md。四屏与独立艺术资源已经制作，服务端测试闭环有本地数据库验收记录；尚无正式自主旅行界面与真机证据。

## Product Principles

- 玩家准备，宠物自主选择出发。
- AI 内容与客户端动画不决定经济和存档。
- 身体结构由宠物资源决定；通用移动控制不绑定物种。
- 演示数据与账号真实数据有明确边界。

## Accessibility & Inclusion

至少 44pt 热区，独立文本、键盘操作、减少动态效果。目标年龄和其他特定用户需求尚未确认。
