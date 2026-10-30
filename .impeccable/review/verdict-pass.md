## verdict

1. **resolved — 通用动作包四向边界。** 已重读更新后的同名 mobile / small / desktop / bag-mobile / walk-left / walk-right 截图，以及四张 anchor-zero / anchor-one 极限位置截图；截图有效，偏心和顶部/底部锚点的角色在两极均完整可见。`model.ts` 的 `petLayout` 现按所有帧的 bounds、rect、anchor 计算四向外延，并以共用缩放保留 48×24 移动区；`PetStage` 在 resize 后更新布局与实际缩放。新增回归覆盖四种极端 anchor、所有帧和三个高度，检查四边 14px 余量及非空移动区。默认猫的尺寸、透明轮廓和左右步行动作未出现可见回归。
2. **resolved — 原尺寸视口复现证明。** `hero-repro.png` 已真实提供 853×1844 当前实现截图，完整显示顶部、实际 480px 容器及底部导航；不是将手机截图拉大。browser-validation.json 同时记录实际视口、容器宽度，并明确这是当前补捕而非历史检查点，补齐原证据缺口。

## remaining

clear — 未发现本次修复引入的材料级回归。本次 ship 仅覆盖原两项修复的评分，不构成新的全表面审查，也不扩大为 iOS 真机或任意 AI 动作质量证明。

disposition: ship
