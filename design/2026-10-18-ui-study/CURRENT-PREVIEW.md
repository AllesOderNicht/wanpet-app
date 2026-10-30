# 丸宠 · 当前整体验看

当前方向：已选庭廊首页、清透水彩、暖木与纸面、低干扰文字操作。以下为Godot实际渲染截图；页面检查使用隔离展示数据，不表示截图里的物品来自真实账号。

## 首页

![首页](/Users/xiamujiadesanhuamao/Desktop/my_code/wanchong/wanpet-app/assets/review/current-ui-2026-10-19/home.png)

## 小屋与庭院

猫咪、家具和背景分别渲染。顶部状态与场景切换保留明确文字，点击地面散步，点击猫咪抚摸。

![小屋](/Users/xiamujiadesanhuamao/Desktop/my_code/wanchong/wanpet-app/assets/review/interior-engawa-v2/interior.png)
![庭院](/Users/xiamujiadesanhuamao/Desktop/my_code/wanchong/wanpet-app/assets/review/courtyard-engawa-v2/activity.png)

## 行囊

点击插画选择，名称和库存为真实控件文本。选中不消耗库存；实际出发由服务器确认。

![行囊选中](/Users/xiamujiadesanhuamao/Desktop/my_code/wanchong/wanpet-app/assets/review/bag-illustration-v2/bag-selected.png)
![短屏行囊](/Users/xiamujiadesanhuamao/Desktop/my_code/wanchong/wanpet-app/assets/review/bag-illustration-v2/small-bag.png)

## 动作预览

下段是状态机接入后的逐帧渲染，展示趴下、抚摸、起身，不是实时帧率录制。每段121源帧，24fps。随后还加入了实际行走的起步加速和到达减速；这段视频不展示该后续改动。

![动作过渡](/Users/xiamujiadesanhuamao/Desktop/my_code/wanchong/wanpet-app/assets/video/transitions-integrated-v1/godot-transition-flow.mp4)

## 可运行版本

[macOS 本地预览包](/Users/xiamujiadesanhuamao/Desktop/my_code/wanchong/wanpet-app/apps/godot/exports/Wanpet-engawa.zip)

本次已重新打开本地Godot客户端，加载当前源码。首次启动因本地3100端口没有后端而停在登录页；随后启动已配置的Godot专用测试后端并重新登录。原生UI状态已确认进入家园，出现准备行囊、收藏、去庭院和抚摸入口。这不是iOS真机验收。

## 验收重点

- 猫咪在首页的样貌、大小是否符合已选图；视频生成帧不能宣称像素完全一致。
- 在活动场景连续点击、转向和停止，观察动作自然度；现有位置/状态测试不能替代这项观感。
- 首页、小屋、庭院、行囊之间是否像同一个产品；当前次级页面仍待整体视觉认可。

已验证：最近页面点击39项；起停四方向37项；主回归87项；过渡24项；原生寻路17项。各数字来自相应独立运行，不代表一个端到端全量测试，也不代表手机稳定60fps。未完成：iOS真机性能与最终视觉认可。

## 真实账号检查补充

本机专用测试账号的行囊显示食物3份、用品1份，旅途为空，收藏含森林与溪流各1张。只读浏览发现溪流缺少插画映射，现已新增原创stream.png并补齐共用映射。没有触发出发或领取，没有改变存档。修复后带两种收藏的原生视口检查43项通过，截图见assets/review/collection-stream/collection-stream.png。

## 待用户视觉反馈

当前已有可运行版本和全套预览。下一轮请依据具体画面或动作指出：原猫外形/大小、行走转向与起停、整体页面风格，哪一项仍不符合期待。待机视频已获认可；其他方向和新页面不能自动视为已认可。未收到反馈前，不继续以新增素材或边缘功能代替这一步审阅。

iOS模拟器构建成功但安装/启动未完成，细节见IOS-SIMULATOR.md；这是单独的平台验证缺口，不把模拟器启动成功当作手机UI已验收。
