# 本地iOS模拟器验证

新增独立预设“iOS Simulator Local”，仅导出Xcode工程，Bundle ID为com.example.wanpet.simulator。SIMULATOR0是满足Godot配置校验的本地占位符，不是真实团队或签名授权。编译必须指定CODE_SIGNING_ALLOWED=NO、CODE_SIGNING_REQUIRED=NO、DEVELOPMENT_TEAM=，仅供模拟器。正式iOS待签名预设未变。

依据Godot官方文档：
- https://docs.godotengine.org/en/latest/classes/class_editorexportplatformios.html （export_project_only）
- https://docs.godotengine.org/en/latest/tutorials/export/exporting_for_ios.html （模拟器Compatibility渲染限制）

实际Godot4.7.2模板含模拟器xcframework。工程导出已成功；过程中修正了配置注释语法，并指定现有便当插画作为临时图标。仍有图标透明和boot_splash/fullsize属性警告；不能用于正式发行。

构建命令：

```sh
xcodebuild -project apps/godot/exports/ios-simulator/WanpetSimulator.xcodeproj -scheme WanpetSimulator -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath apps/godot/exports/ios-simulator/DerivedData CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO DEVELOPMENT_TEAM= build
```

当前仅证明工程导出，编译与模拟器启动结果待核对。没有发布、真机安装或使用开发者账号。模拟器不能作为真机帧率证据。

## 实际编译诊断

首次arm64模拟器链接失败：`Undefined symbols for architecture arm64: _main`。用lipo核对导出工程中的ios-arm64_x86_64-simulator/libgodot.a，结果为仅x86_64；Info.plist却宣称arm64与x86_64。目录名/元数据不能证明库真实架构。已转为ARCHS=x86_64 EXCLUDED_ARCHS=arm64再次构建，运行兼容性仍需验证。

x86_64构建已返回BUILD SUCCEEDED（退出0）。iOS26.2的iPhone17模拟器bootstatus返回Finished。正在验证安装/启动，不能由编译成功推断页面可用。

## 安装未完成

安装命令simctl install持续约49分钟未返回；只读进程检查确认仍停在install，后续launch尚未执行，没有WanpetSimulator应用进程。Simulator原生界面仍显示系统主屏。GUI观察工具本身也异常耗时约48分钟。

已结束本任务对应的安装命令及其父shell，未重启模拟器或自动重复安装。当前结论只有“x86_64编译成功”，不能宣称应用已在iPhone模拟器运行。后续需定位CoreSimulator安装服务/运行时兼容性；当前导出库缺少arm64模拟器slice仍是独立已证实问题。

## 有界复核

直接从原始ios.zip提取模拟器libgodot.a后，lipo仍确认只有x86_64，排除本次导出误丢arm64的推断。simctl list devices booted成功，iPhone17显示Booted；get_app_container查询12秒未返回，查询子进程已结束。没有再次安装，没有重启共享服务，也没有把查询超时称为应用安装失败的精确原因。

结论：模板架构缺口已证实；安装服务/运行时状态异常的根因尚未定位。此平台验证作为独立未完成项保留，不据此继续更改已交付UI美术方向。真实手机性能仍未验证。
