# 账号与云端部署进度（2026-10-29）

已实现邮箱注册登录、中文可重名称呼、9–128字符密码、不按时间过期的可撤销会话、设备安全存储及启动验证恢复。新增迁移 202610290002_email_persistent_sessions 保留现有开发数据。未提交或推送。

本地通过：scaffold、Prisma schema与配置检查、类型检查、47项后端单元、43项移动会话、50项界面测试、72项数据库集成测试。专用测试库 wanpet_test_auth20261029，连接池5；初次默认连接池的图片测试连接失败，按文档连接池配置重跑72项全部通过。

Godot资源已构建；签名Release包已构建，路径 `.tools/iphone-cloud-playtest/Build/Products/Release-iphoneos/WanpetMobile.app`，Bundle ID com.wanpet.playtest，API https://www.alleschen.com/wanpet-api/v1。尚未安装或进行真机独立联网验收。

阿里云旧服务仍是 /opt/wanpet/releases/20261017-backend-foundation。备份位于 /opt/wanpet/backups/20261029-account-fix，包含验证可读取的 pre-deploy.dump、配置及旧证书；新源码与依赖已准备于 /opt/wanpet/releases/20261029-email-sessions，尚未切换。Prisma Linux引擎官方源下载失败，需核验并复用同版本官方引擎或验证校验和后下载。

用户已在阿里云签发新证书，覆盖www与根域名，至2027-01-27有效，尚未部署。早期ACME验证因www双A记录及根域挑战403失败；已安装Certbot并添加挑战路径，尚未配置自动续期。

已在应用内阿里云DNS控制台暂停 www→43.160.248.49 的重复记录，保留 www→8.130.36.187 启用，infra和其他记录未修改，TTL10分钟。记录保留以便回退。

历史阻塞：SSH曾返回不同主机公钥，自动审批拒绝了远端写入；现已通过阿里云控制台独立核验原公钥并恢复严格校验连接，详情见下。

待完成：新证书部署与自动续期、云端权限验证、AI配置和pgvector/Ollama容量与功能验收、云端迁移切换和回滚验证、iPhone安装及Wi-Fi/蜂窝网络和重启登录验收。不得将当前状态报告为部署完成。

2026-10-29 22:46 后续：通过阿里云控制台云助手在实例 i-0jl933l0vs01pj0431do（公网 8.130.36.187）执行只读指纹查询，得到 ECDSA SHA256:kwnZrccunPy94W8igwjJq4BZrS/e/WstCM5h7DmqJ0U，与任务前保存的密钥一致，不同于曾被连接返回的 SHA256:ylKeeYLCpDuKDlmvFIJRwHRMiWfyNgUdulsdb+jaHT0。随后使用原已知密钥严格校验 SSH 成功。

隔离演练库 wanpet_test_account_rehearsal_20261029 从 pre-deploy.dump 恢复，并成功执行 202610170002 至 202610290002 共 7 个待执行迁移；未删除演练库。Prisma 引擎 6.19.3 复用旧 release 的文件，schema 和 query 引擎分别校验 SHA256 一致。新 release 先构建 contracts 再构建 server 成功；仍未切换。

容量阻塞：ECS 2 GiB（系统可见 1870 MiB），检查时可用 1168 MiB，交换空间已用 480 MiB；已有嵌入模型 bge-m3:567m 官方标注模型文件 1.2 GB，加载还需要运行时及其他服务内存。无法在不影响现有服务的前提下确认完整能力可安全运行，因此未部署 Ollama、未执行业务迁移及服务切换。磁盘 40 GB，可用 22 GB。需要增加容量或用户明确选择其他符合需求的部署资源；未自动购买或禁用能力。

2026-10-30：按用户要求改用火山方舟 `doubao-embedding-text-240715`，移除运行时对 Ollama 的依赖。该模型为 2560 维，使用独立集合 `wanpet_memories_doubao_240715`；新增 202610300001_ark_memory_reindex 将存在有效记忆的会话标记为待重建。旧集合保留，若回退需重建旧索引并遵循记忆删除策略。云端演练库执行新增 SQL 成功（UPDATE 0，该备份没有待重建记忆）；尚未应用到业务库。

本地 scaffold、类型检查、后端构建与 49 项后端单元测试通过，包含模拟火山请求及 mem0 LangChain 适配测试。尚无真实 Ark API 调用、pgvector 端到端或新迁移的完整数据库集成验证。本地原测试数据库当前无法连接，Prisma 报 Schema engine error；云端 pgvector 尚不可用。项目 .env 与服务器配置未检测到 ARK_API_KEY；服务器配置亦未检测到 TOKEN_HUB_API_KEY 或 SEEDREAM_API_KEY。未尝试输出或复制凭据。之前依据 Ollama 内存需求提出的容量阻塞需按新架构重新评估，不应视为已验证安全运行。
隔离库另以临时表和回滚事务验证：有有效记忆的会话被标记，只有失效记忆的会话不被标记。

2026-10-30 后续：用户指出本地 `.env` 中已有 HUOSHAN_API_KEY，配置现支持该变量及 ARK_API_KEY 别名。以合成文本调用火山方舟旧模型，得到 HTTP 404 / InvalidEndpointOrModel.NotFound，不能判断是模型不存在还是当前账号无权限；官方公告该旧模型已停止新建接入点，存量接入点可继续使用。正在等待用户提供存量接入点 ID 或选择推荐替代模型。凭据未输出或复制到服务器。服务器从现有 PGDG 软件源安装 pgvector_17 0.8.7；仅隔离演练库启用扩展，并用回滚事务验证 2560 维向量存储及余弦查询。重新运行类型检查、49 项后端单元测试、后端构建通过。业务库未迁移，新服务未切换。

用户同意试用 doubao-embedding-vision-251215：合成文本真实 API 返回 HTTP 200、2048 维。现已采用多模态接口、逐条向量化和独立集合 wanpet_memories_vision_251215；适配器合成检索中水果记忆与水果问题余弦 0.792，高于无关记忆 0.670（仅是小样本烟测）。隔离库验证 2048 维向量及余弦查询。scaffold、类型检查、49 项后端单元测试及后端构建通过；真实 mem0+pgvector+火山端到端、服务器容量及发布仍未验收。火山官方文本输入公开价格 0.70 元/百万 token，实际用量与账户计费以控制台为准。

2026-10-30 最终发布与验收结果见 [最新记录](account-deployment-20261030.md)。已完成云端切换、真实 mem0/聊天/生图验证及 iPhone 安装启动；用户取消自动换证要求，手机界面和网络切换验收仍待确认。
