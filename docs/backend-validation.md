# 后端基础阶段验收记录

日期：2026-10-17。范围：用户名密码账号、可撤销会话、测试宠物与背包初始化、玩家快照、阿里云开发测试部署。

本文保留基础阶段的历史部署证据。当前源码另有测试旅行闭环改动，见 [travel-backend.md](travel-backend.md)；该新增切片仅在本地隔离库验证，尚未更新本文所列阿里云 release 或源码指纹。

## 已通过

- Node 24.14.1；scaffold、Prisma generate/schema 校验、Prisma 配置兼容检查、所有 workspace 类型检查、客户端与服务端构建。
- 单元测试统计 4/4；真实数据库/API 集成测试统计 12/12。在本机隔离 PostgreSQL 14 测试实例和阿里云 PostgreSQL 17.9 专属测试库分别通过。测试实例已停止。
- 覆盖输入边界、Unicode 密码、哈希队列上限、请求体 16KiB 限制、CORS、认证限流、同名并发注册、100 路并发初始化、同键重放、事务故障回滚、库存非负、跨账号隔离、令牌过期/退出、改密撤销全部会话、进程重启恢复及数据库故障的 503 分类。
- 当前依赖 npm audit 为 0 个漏洞；已确认项目源码中不含本地配置的实际 SSH 密码，示例配置只保留占位值；git diff --check 通过。
- 部署后的实际 API 再次完成 100 路不同键初始化，仅一次创建、一次发放；重启后原令牌可读取相同宠物与库存；改密撤销旧令牌，新密码可登录，退出令牌失效。
- 从开发库生成 PostgreSQL 自定义格式备份，恢复到新建 wanpet_test_restore；统一 UTC 后逐表核对 Account、Session、Player、Pet、Inventory、StarterGrant、IdempotencyRecord 与迁移记录，数据一致。开发库保留一个专用烟测账号，无有效会话。
- 最小权限实际查询：运行角色无 schema CREATE、无初始发放 UPDATE、无幂等记录 DELETE，有迁移状态 SELECT。配置权限为应用 0640 root:wanpet、迁移/测试 0600 root:root；备份 0600。
- 本机经临时 SSH 转发访问远端 readiness 成功；临时隧道已关闭。原有 Nginx、PostgreSQL、Redis、Garage、Futu 服务仍为 active。

## 部署标识

- 服务器：8.130.36.187；systemd：wanpet-dev（enabled）；用户：wanpet。
- release：/opt/wanpet/releases/20261017-backend-foundation；current 为该目录链接。
- API：127.0.0.1:3100/v1，只监听 loopback；readiness 返回 ready。资源上限为 512MiB、1 CPU。
- 数据库：wanpet_dev、wanpet_test；恢复验证库：wanpet_test_restore，均为本项目专属。
- 备份：/opt/wanpet/backups/pre-initial-migration.dump 与 verified-foundation.dump。
- 实现源码 SHA-256：f7902f21f377e23e596a7d27a55dc7e4ba852a1b2ed50dae0feee6476c226ea6。指纹覆盖服务端源码/schema/迁移/测试、contracts 源码、构建清单、CI、ops 和检查脚本；本地与部署 release 一致。

Prisma 官方 Linux 引擎下载受到客户端连通性影响。本次使用 HTTPS curl 从官方源下载，并验证压缩与解压文件校验和后传输，未关闭 TLS 或跳过校验。运行库 SHA-256 为 f20c6e2dcebff809532f24cc1af5e47bdd7e735c1ef8da49e36076fa4ac23515；schema 引擎为 bb18ae5d10db88600957946b68411471c5b46b412fed27b3f816b39f15532802。

## 未运行与边界

- GitHub CI 工作流已新增，尚未提交/推送，因此未验证 GitHub 实际运行。
- 浏览器玩法、iOS 编译/真机、旅行/领奖/收藏、AI、自助找回密码不在本轮范围内。
- 未开放公网 API、未修改既有业务服务配置、未做生产发布。
- 限流是单实例内存实现，重启清空；当前测试结果不代表生产容量或正式上线验收。
