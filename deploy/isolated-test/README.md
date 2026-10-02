# 独立合成验收实例

此入口复用当前PostgreSQL知识库及同步协议，用于独立测试库上的网页↔合成SQLite设备验收。不是应用账号系统，也不用于替换生产JSON部署。不会导入生产资料、创建公网用户或自动配置DNS/认证。

## 实际目标核查与待决定事项

2026-10-02只读SSH确认现有ECS：生产PM2 `knowra-api`/`knowra-web`在线，3001/3000仅回环，运行提交5728856的独立发布目录，JSON真源仍为`/opt/knowra/storage`；公网主页401、health200，Nginx Basic Auth已启用。约1608MiB总内存、745MiB available、26GiB空闲磁盘；Node24，未发现Docker/PostgreSQL或现成测试实例。没有修改生产服务、认证、网络、数据库或用户App。

推荐独立Linux验收主机：至少2GiB内存供低负载合成测试，4GiB更有余量；构建在CI/验收机，生产ECS不运行构建或测试。此配置三容器总内存上限1280MiB，不能由现有生产745MiB余量推断可安全共机。用户需提供已授权独立主机，或批准新资源及费用上限。当前没有明确可写部署目标，不擅自购买/安装/上线。

首选URL为通过既有授权SSH隧道访问`http://127.0.0.1:<独立端口>`，无需新DNS或开放应用端口；两端可分别建立隧道。真正公网HTTPS另需独立测试域名/证书和专用访问认证，见[独立Nginx模板](nginx.conf.example)。该文件仅模板，不加载生产Nginx，也不复用生产密码文件。用户自行安全配置凭据，不在聊天发送秘密。

## 隔离边界

- Compose项目名、私有网络和两份命名卷按测试ID区分；PG无任何宿主机端口，app只发布到127.0.0.1。网络`internal: true`隔绝容器外部连接，AI入口另明确503拒绝，不能写模型凭据或调用供应商。[Docker网络说明](https://docs.docker.com/reference/compose-file/networks/)
- 专用PG数据库及owner为`knowra_acceptance_<ID>`，新库产生新同步世代；业务、同步日志、队列和附件元数据都在该库，附件/清理意图及backups/exports/temp/logs在实例卷。无生产DB URL默认值或生产目录挂载。
- 未登记非空数据库/目录拒绝接管；DB与目录持久标识必须对应同一实例，源码/生产目录、符号链接、schema/host连接覆盖、生产端口/生产域名拒绝。启动不自动迁移旧资料或重新绑定丢失标识。初次登记跨文件/数据库若遭中断，保留现场并停止，须维护者核验，不自动删数据。
- 页面醒目显示“测试环境 · 仅合成资料 · ID”，响应有`X-Knowra-Test-Instance`，health返回实例ID和syntheticOnly。提示不能自动识别真实正文；只允许人工合成资料，不上传原用户备份或笔记。
- Basic用户名不映射独立owner。测试库本身也按单owner运行；多访问者共享该合成库。独立隔离来自实例/DB/卷，非完整多租户认证。

## 获授权主机的准备与启动

仅在目标、资源/费用和凭据配置获批准后执行。需要Docker Compose及由当前固定提交构建的镜像，不在现有生产机安装它们。密码文件由维护者安全提供；使用私有父目录、只读文件，并确认容器中的PG及node用户能读取。Compose文件secret不自动配置文件owner/mode；不要把秘密放进仓库、镜像或环境模板。[Docker secret说明](https://docs.docker.com/reference/compose-file/secrets/)

非秘密参数示例（ID为2–25位小写字母/数字/下划线）：

```bash
export KNOWRA_TEST_INSTANCE=qa_oct
export KNOWRA_TEST_RELEASE=<已审查的完整提交SHA>
export KNOWRA_TEST_PORT=43100
export KNOWRA_TEST_DATABASE_PASSWORD_FILE=<获授权配置的专用只读密码文件绝对路径>
# 只有已获授权的独立HTTPS入口才设置；隧道模式留空。
export KNOWRA_TEST_PUBLIC_ORIGIN=https://test.example.invalid
docker compose -f deploy/isolated-test/compose.yml config --quiet
docker compose -f deploy/isolated-test/compose.yml build migrate
docker compose -f deploy/isolated-test/compose.yml up -d
```

迁移容器仅接该专用库，成功后app启动；数据库/目录初次登记为空，后续重启保持数据。镜像包含已有Prisma客户端、迁移CLI及V4生产构建；不改正式生产发布包。没有自动restart或systemd/PM2持久化配置，持久访问/自启需明确授权。

隧道只使用已有授权SSH目标，例如`ssh -N -L 43100:127.0.0.1:43100 <已批准的验收主机>`；浏览器打开本机对应端口。不要将当前真实App改接此库。Mac端应先核实独立资料目录/独立启动方式，再只使用合成笔记，不清空或迁移日常资料。

已有Node24/独立PG环境也可使用`node scripts/start-isolated-test.mjs`；需明确`KNOWRA_TEST_INSTANCE`、源码外绝对`KNOWRA_TEST_DATA_ROOT`、`KNOWRA_TEST_DATABASE_URL`及独立端口。普通入口只回环，`DATABASE_URL`生产变量被忽略。必须先对空专用库应用迁移；不自动安装PG或创建DB/账号。

## 验证、停止与证据

获授权回环目标可运行`node scripts/verify-isolated-instance.mjs http://127.0.0.1:43100 <ID>`；先核对health实例标识再写一篇合成自检笔记。重启后加`--verify-existing`检查该笔记仍在。脚本不接受公网URL进行自动写入。

`docker compose ... stop`仅停止该测试项目、保留卷。不要对用户持续验收库运行`down --volumes`，保留DB dump、完整实例卷和固定提交，恢复先核对标识。此规范不宣称生产灾难恢复或LC34通过。

标准scripts测试实际创建两份临时独立数据库和目录，验证不同owner/世代、笔记和附件不可串库、两个真实SQLite设备与网页HTTP同步、重启保留、旧非空库和符号链接拒绝。CI另实际构建镜像/启PG/迁移/写读/重启，并验证仅回环发布和独立卷；其密码/数据库/卷全为一次性合成测试。CI脚本明确拒绝在用户主机执行，只有它在结束后销毁自身CI卷。当地无Docker daemon则不虚称容器通过，以确切head CI为准。

本机合成回环验证不代表已上线公网、真实Mac App双端或供应商通过。当前真实上线仍阻塞于独立目标与相应资源/访问授权；配置和固定head测试/审查/CI证据在对应PR。
