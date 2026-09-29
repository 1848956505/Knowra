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

当前正式运行时仍使用本地 JSON 存储，尚未加载 Prisma/Nest/BullMQ 脚手架。正式发布包由 GitHub Actions 的 Ubuntu 24.04 运行器生成：先通过测试与审计，再用 `npm ci --omit=dev --ignore-scripts` 安装 Linux 生产依赖并打包 V4 产物。未来正式启用 Prisma 前，必须补齐客户端生成、数据库备份与迁移验证。

完整单元/集成测试和 E2E 只在 CI 或独立验收机执行。按需发布时，Codex 在已登录 GitHub 且已有 ECS SSH 权限的 Mac 上运行 `scripts/deploy-ci-release.sh <main 的完整提交 SHA> root@47.95.236.184`。脚本只接受当前 `main` 且 CI 成功的提交，下载并核对发布包，再通过 SSH 交给服务器激活。用户无需手动下载或上传。

`scripts/activate-ci-release.sh` 在服务器上确认提交与 GitHub `main` 一致，备份 `storage/data` 和 `storage/uploads`，对旧版与候选版分别执行附件完整性只读检查；随后将独立发布目录切为 `current`，从新目录重建 PM2 进程并核对实际执行路径及本机 API/Web 健康。进程切换期间有短暂重启窗口；失败时恢复上一运行目录。服务器保留 `/opt/knowra/storage` 作为唯一真源，不在生产机执行 `npm ci`、测试或前端构建。首次成功后 `/opt/knowra` 仍保留 Git 仓库供备份任务记录提交；`current` 指向实际运行版本。Nginx 路由不变。

发布成功后删除本次传输的压缩包与校验文件，保留发布目录及备份供回滚；定期查看 `.deploy-releases/` 和 `/opt/knowra-backups/` 的占用后再清理过旧记录。

原 `scripts/post-deploy.sh` 仍作为需要现场构建时的人工应急入口；不要在常规发布中调用它。

PM2 配置中，`KNOWRA_API_PORT` 同时决定 API 监听端口和 Web 的默认代理目标；只有显式设置非空 `API_ORIGIN` 时才覆盖该派生目标。调整 API 端口时不再需要重复维护默认 origin。`KNOWRA_WEB_PORT` 仍只控制 Web 监听端口，修改后需同步核对 Nginx 上游。

生产进程严格使用 `PORT=3000/3001`：任一配置端口被占用时，对应进程必须启动失败，不会自动改用其他端口。开发环境仍可自动选择可用端口。

完整发布、备份、验证与回滚步骤见 [`docs/阿里云ECS服务器信息.md`](../docs/阿里云ECS服务器信息.md)。
