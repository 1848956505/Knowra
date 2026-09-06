# Knowra 生产部署

本目录只保存可公开的部署模板，不保存密码、私钥、云账号凭据或运行时数据。

## 上线前安全门禁

Knowra 当前没有多用户账号系统。公开部署时必须由 Nginx 对整个站点启用 HTTP Basic Authentication，仅保留 `/api/health` 匿名访问，用作健康检查。

API 使用服务端 `KNOWRA_OWNER_ID`（默认 `demo`）固定当前数据所有者，并忽略客户端提交的 `userId`。这个设置只能阻止客户端切换 owner，**不能验证访问者身份**，不能替代 Basic Auth 或正式登录系统。

服务器上创建密码文件：

```bash
apt-get update
apt-get install -y apache2-utils
htpasswd -c /etc/nginx/.htpasswd-knowra knowra
chown root:www-data /etc/nginx/.htpasswd-knowra
chmod 640 /etc/nginx/.htpasswd-knowra
```

不要把输入的密码或生成的 `.htpasswd-knowra` 提交到仓库。

## Nginx

复制 [`nginx/knowra.conf.example`](nginx/knowra.conf.example)：

```bash
cp /opt/knowra/deploy/nginx/knowra.conf.example /etc/nginx/sites-available/knowra
ln -sfn /etc/nginx/sites-available/knowra /etc/nginx/sites-enabled/knowra
nginx -t
systemctl reload nginx
```

Node 服务的 `3000`、`3001` 端口只供本机 Nginx 与 Web 代理访问，不应在云安全组或主机防火墙中对公网开放。

当前正式运行时仍使用本地 JSON 存储，尚未加载 Prisma/Nest/BullMQ 脚手架。CI 与服务器部署统一使用 `npm ci --ignore-scripts`，避免未启用依赖的生命周期脚本下载 Prisma 引擎或执行额外安装代码；V4 产物由 `npm run build:web` 显式生成。未来正式启用 Prisma 前，必须同步调整这条门禁并增加生成与迁移验证。

完整单元/集成测试和 E2E 只在 CI 或独立验收机执行，不在正在提供服务的生产主机运行。生产主机只执行附件完整性门禁、生产构建、PM2 刷新和健康检查。

`scripts/post-deploy.sh` 会先对服务器真源执行附件完整性只读检查，仅在报告为 `ready` 时继续构建 V4；随后拒绝携带 Source Map 的生产产物，并通过 `deploy/ecosystem.config.cjs` 将 PM2 的 `knowra-web` 入口刷新为 `apps/web-v4/server.mjs`。Nginx 仍反向代理本机 `3000`，无需改变公网路由。V3 仅保留源码与回归测试，不再提供启动入口。

PM2 配置中，`KNOWRA_API_PORT` 同时决定 API 监听端口和 Web 的默认代理目标；只有显式设置非空 `API_ORIGIN` 时才覆盖该派生目标。调整 API 端口时不再需要重复维护默认 origin。`KNOWRA_WEB_PORT` 仍只控制 Web 监听端口，修改后需同步核对 Nginx 上游。

生产进程严格使用 `PORT=3000/3001`：任一配置端口被占用时，对应进程必须启动失败，不会自动改用其他端口。开发环境仍可自动选择可用端口。

完整发布、备份、验证与回滚步骤见 [`docs/阿里云ECS服务器信息.md`](../docs/阿里云ECS服务器信息.md)。
