# 后端开发、验证和测试部署

## 本地

使用 .nvmrc 中的 Node 24.14.1；真实配置放入被忽略的根目录 .env，参照 .env.example。配置至少包含 NODE_ENV=development、DATABASE_URL、CLIENT_ORIGIN=http://localhost:5173，建议 HOST=127.0.0.1、PORT=3100。支持多个逗号分隔的精确 Origin；公共 Origin 必须 HTTPS。本阶段服务只绑定 loopback。

依次执行：

```sh
npm ci --ignore-scripts
npm run check:scaffold
npm run db:generate
npm run db:validate
npm run check:prisma-config
npm run typecheck
npm test
npm run build
```

Prisma 的客户端生成是显式审阅的步骤；首次可能下载与锁定 Prisma 版本对应的官方引擎。不要运行无关依赖的安装脚本。根目录 db:* 命令显式加载 .env，已有 shell 环境变量优先。schema 位于 apps/server/prisma；迁移使用 db:deploy，不使用 db push 或 reset。

为真实集成测试新建独立数据库 wanpet_test，设置 DATABASE_URL 和 TEST_DATABASE_URL 为该库后，依次运行 `npm run db:deploy`、`npm run test:integration`。测试拒绝非 wanpet_test 或 wanpet_test_后缀名称的库。测试会创建账号并临时安装回滚测试触发器，应使用独立测试库拥有者运行，不能指向开发存档库。每次测试使用独立用户名，不清空已有表。

`npm run dev:server` 先编译后以 tsx watch 启动；生产形式使用编译后 dist/main.js。Godot 客户端已接入账号、真实库存和测试旅行；本机专用后端启动见 [Godot 开发说明](godot-development.md)。React 客户端仍为此前的离线预览。后端测试旅行规则和验收见 [travel-backend.md](travel-backend.md)。

新增旅行迁移 202610170002_trip_loop 只增加表与约束，readiness 要求当前版本的全部迁移完成（含 cat_life、pet_chat 和 memory_task_generation）。部署时仍须在备份后由迁移角色执行，再运行更新的 grant-runtime.sql；本轮只验证了本地隔离测试库，未更新阿里云服务或数据库。回退应用保留新增表与账本，不删除已记录旅程。

## 阿里云开发环境

服务：wanpet-dev；非登录用户：wanpet；运行时：/opt/wanpet/runtime/bin/node；release：/opt/wanpet/releases；当前链接：/opt/wanpet/current；私密配置：/etc/wanpet/wanpet-dev.env（root:wanpet，0640）。systemd 模板见 ops/wanpet-dev.service。

开发库 wanpet_dev：wanpet_migrator 拥有 schema 并执行迁移；wanpet_app 只有业务 DML 与迁移状态读取权限，无建表权限，初始发放及幂等记录只允许插入和读取。wanpet_test 使用独立测试角色，只有该测试数据库权限。三者不访问已有业务库，不复用已有业务密码。

首次配置前检查目标数据库、角色、目录、端口和系统用户不存在；若已有名称，必须验证本项目管理标记及归属，不能覆盖。密码由服务器生成，留在受限配置文件内；不得输出到发布日志。数据库 URL 中使用本机 127.0.0.1:5432，业务 API 为 127.0.0.1:3100。不修改现有 Nginx、防火墙或 Redis。

部署顺序：上传排除 .git/.env/node_modules/dist 的源码包 → 新 release 中 npm ci --ignore-scripts → db:generate → 类型与单元检查 → 独立 wanpet_test 迁移和集成测试 → build → 对 wanpet_dev 备份 → 迁移 → 执行 ops/grant-runtime.sql 授予最小运行权限 → 切换 current → 重启 wanpet-dev → readiness 与业务烟测。

运行用户只读 release，不能修改应用文件；512MiB 内存、单 CPU 配额。部署构建和数据库集成测试不在服务用户下运行。首次部署前验证当前可用内存；不要在资源紧张时与密码压力测试同时构建。

联调使用已有 SSH 凭据：

```sh
ssh -N -L 3100:127.0.0.1:3100 root@8.130.36.187
curl http://127.0.0.1:3100/v1/ready
```

HTTP 仅在 loopback 上传输，远端链路由 SSH 加密。当前没有公网 API 或公开 HTTPS 测试域名。SSH 环境变量只供运维连接使用，不写入应用配置。

## 验收与恢复

部署后验证：注册 → 登录 → 初始化 → 同键重试 → 快照 → 重启服务 → 用原令牌读取相同宠物/库存 → 改密 → 原令牌失效 → 新密码登录 → 快照不变。烟测账号为专用测试数据，初始化没有奖励以外的后续经济写入口。

迁移前使用 PostgreSQL 17 的 pg_dump 对 wanpet_dev 创建自定义格式备份，私密目录 0700、文件 0600；pg_restore --list 验证归档，并在独立 wanpet_test_restore 库恢复检查。备份和恢复只涉及本项目数据库。应用回滚切回上一 release 并重启，不自动回滚或删除数据库 schema。首次部署没有上一版时，失败即停止新服务、保留数据与日志。

排查使用 `systemctl status wanpet-dev` 与 `journalctl -u wanpet-dev`。错误日志仅含 requestId、错误分类和 HTTP 状态；健康/就绪探测与业务测试分别验证。CI 文件已提供，实际 GitHub 运行需提交后验证；本轮不推送。

## 官方引擎下载受限时

本次服务器无法直接完成 Prisma Linux 引擎下载。可从可连通的开发机通过 HTTPS curl 下载锁定 Prisma 提交对应的官方 binaries.prisma.sh 引擎及其 .gz.sha256、.sha256，分别校验压缩文件和解压文件后传入 release 的 node_modules/@prisma/engines。仅在生成/迁移命令中设置 PRISMA_QUERY_ENGINE_LIBRARY 和 PRISMA_SCHEMA_ENGINE_BINARY 指向对应文件；生成器会把运行库复制到 .prisma/client。不要关闭 TLS 或跳过校验。当前平台为 rhel-openssl-1.1.x，提交 c2990dca591cba766e3b7ef5d9e8a84796e47ab7；升级依赖必须重新核验。

## 本地宠物聊天

新增的 Codex SDK、mem0 和语音配置见 [宠物对话](pet-chat.md)。Codex SDK 需要对应平台的 CLI 二进制；Node 24 服务端使用动态 ESM 导入。当前仅验收单实例、本地数据库与模拟器，既有远端服务的 512MiB 配额不能视为已满足新 Agent 和嵌入模型的资源要求。本轮没有部署远端或修改远端配置。
