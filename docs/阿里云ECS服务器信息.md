# 阿里云 ECS 服务器信息

更新时间：2026-07-08

本文档用于在其他设备上的 Codex 继续接入和维护当前 知境·Knowra 服务器。不要在本文档中保存私钥、服务器密码、API Key 或其他明文密钥。

## 基础信息

- 云厂商：阿里云
- 服务器类型：ECS
- 操作系统：Ubuntu 22.04.5 LTS
- 主机名：`iZ2ze79rc2xe67bwj2jq4gZ`
- 公网 IP：`47.95.236.184`
- 内网 IP：`172.26.73.107`
- SSH 用户：`root`
- SSH 端口：`22`
- 域名：`https://knowra.qwdream.top/`
- 公网 IP：`http://47.95.236.184/`（HTTP 自动跳转 HTTPS）
- 健康检查地址：`https://knowra.qwdream.top/api/health`
- HTTPS 证书：Let's Encrypt，有效期至 2026-10-06

## SSH 连接

当前 Windows 电脑已经把 SSH 公钥加入服务器，可以直接连接：

```bash
ssh root@47.95.236.184
```

MacBook 或其他新设备需要单独添加自己的 SSH 公钥，不能复用 Windows 私钥。

## MacBook Codex 接入步骤

在 MacBook 终端执行：

```bash
ls ~/.ssh
```

如果已有 `id_ed25519.pub`，查看公钥：

```bash
cat ~/.ssh/id_ed25519.pub
```

如果没有，生成一把新 key：

```bash
ssh-keygen -t ed25519 -C "macbook-codex"
cat ~/.ssh/id_ed25519.pub
```

复制输出的整行公钥，然后在服务器上执行：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s\n' 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIm+9chI8ys897hzAxZB59G0J4yu7ROdpGGW72R2kiNK macbook-codex' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

之后在 MacBook 上测试：

```bash
ssh root@47.95.236.184
```

测试通过后，MacBook 上的 Codex 就可以通过 SSH 管理这台服务器。

## 项目部署位置

服务器项目目录：

```text
/opt/knowra
```

Git 仓库远程地址：`git@github.com:1848956505/Knowra.git`（部署用 Deploy Key 认证）

当前部署方式：

- Node.js monorepo（Git 克隆）
- 前端服务：`apps/web/src/main.js`
- 后端服务：`apps/api/src/main.js`
- 进程管理：PM2（进程名 `knowra-web` / `knowra-api`）
- 反向代理：Nginx（HTTPS 443 端口）
- 对外端口：`443`（HTTPS），`80`（HTTP → HTTPS 跳转）

## 运行时服务

Node.js 和 npm：

```text
Node.js: v24.18.0
npm: 11.16.0
```

PM2 服务：

```text
knowra-api  -> /opt/knowra/apps/api/src/main.js, PORT=3001
knowra-web  -> /opt/knowra/apps/web/src/main.js, PORT=3000, API_ORIGIN=http://127.0.0.1:3001
```

常用命令：

```bash
pm2 status
pm2 logs knowra-api
pm2 logs knowra-web
pm2 restart knowra-api knowra-web --update-env
pm2 save
```

## 部署流程

代码从 GitHub 拉取部署：

```bash
cd /opt/knowra

# 1. 拉取新代码
git pull

# 2. 必要时更新依赖
npm install

# 3. 必须跑：生成 milkdown bundle + 重启 PM2
./scripts/post-deploy.sh

# 4. 重启所有服务（确保环境变量生效）
pm2 restart knowra-api knowra-web --update-env
pm2 save
```

`scripts/post-deploy.sh` 等价于：

```bash
npm run build:editor-bundle -w @study-accelerator/web
pm2 restart knowra-web --update-env
```

> 经验教训：2026-07-05 的 404 事件就是因为部署只跑了 `git pull` + `pm2 restart`，
> 忘了重新生成 bundle，PM2 起来后发现 bundle 不存在，前端 50% 资源加载失败。
> 现在把 build 步骤收进 `scripts/post-deploy.sh` 避免再犯。

## Nginx 配置

当前配置文件：

```text
/etc/nginx/sites-available/knowra
```

当前完整配置（HTTPS + HTTP 跳转）：

```nginx
server {
    listen 80;
    server_name knowra.qwdream.top;
    client_max_body_size 100m;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name knowra.qwdream.top;
    client_max_body_size 100m;

    ssl_certificate /etc/letsencrypt/live/knowra.qwdream.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/knowra.qwdream.top/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

说明：

- HTTP（80）自动 301 跳转到 HTTPS（443）。
- 浏览器访问域名后，前端请求使用相对路径 `/api/...`。
- 前端服务内部再把 `/api/...` 代理到 `http://127.0.0.1:3001`。
- 证书由 Let's Encrypt 自动续期（`certbot renew`）。

检查和重启 Nginx：

```bash
nginx -t
systemctl restart nginx
systemctl status nginx
```

## 数据路径

当前统一的活跃数据文件：

```text
/opt/knowra/storage/data/knowledge-base.json
```

本地对应路径：

```text
storage/data/knowledge-base.json
```

历史原因：旧数据曾位于 `apps/api/storage/data/knowledge-base.json`。现在运行时统一读取根目录下的 `storage/data/knowledge-base.json`，本地与服务器都应保持这个路径为准。

附件路径约定：

- 运行时附件目录统一使用根级 `storage/uploads/`
- `attachments[*].storagePath` 统一保存为跨平台相对路径：`storage/uploads/<attachment-id>-<safeName>`
- 不再把 Windows 风格 `storage\\uploads\\...`、Linux/macOS 绝对路径，或旧的 `apps/api/storage/uploads/...` 作为长期真源
- 如遇旧快照或旧服务器目录残留，优先迁移文件到根级 `storage/uploads/`，再让元数据回写为上述统一格式

服务器上的恢复前备份：

```text
/opt/study-accelerator/storage/data/knowledge-base.json.backup-20260704-before-full-data-restore
```

本地恢复前备份：

```text
storage/data/knowledge-base.json.backup-20260704-before-local-full-data-restore
```

## 部署辅助文件

本地部署文件位于：

```text
deploy/
```

重要文件：

```text
deploy/install-on-ubuntu-22.04.sh
deploy/README-aliyun-deploy.md
deploy/study-accelerator-full-20260704-180304.tar.gz
```

服务器上的安装脚本副本：

```text
/tmp/install-on-ubuntu-22.04.sh
```

脚本已改为不硬编码公网 IP：

- 默认 `SERVER_NAME=_`
- 默认不写 `CORS_ALLOWED_ORIGINS`
- 项目存储路径使用相对路径：`storage/...`

如果未来绑定域名，可以这样运行安装脚本：

```bash
SERVER_NAME=example.com PUBLIC_ORIGIN=http://example.com /tmp/install-on-ubuntu-22.04.sh /tmp/study-accelerator-full.tar.gz
```

## 安全组

当前公网 HTTP 能访问的前提：

- ECS 实例绑定的安全组已放行入方向 TCP `80`
- 来源当前为 `0.0.0.0/0`
- SSH 使用 TCP `22`

如果只想自己访问，建议把 TCP `80` 的来源改成自己的公网 IP `/32`。

## 安全注意事项

当前服务是公开测试状态：

- **已启用 HTTPS**（Let's Encrypt 证书）。
- 当前项目还没有登录鉴权。
- 只要知道域名或公网 IP，别人可以访问页面和 API。
- 不要把私钥、密码、云账号凭据写入仓库或本文档。

后续建议：

1. 增加登录系统，并保护所有 `/api/*` 接口。
2. 创建非 root 的部署用户，例如 `deploy`。
3. 关闭 root SSH 登录或限制 root 登录来源。
4. 定期备份 `storage/data/knowledge-base.json` 和 `storage/uploads/`。

## 快速验证

在任意能联网的机器上执行：

```bash
curl https://knowra.qwdream.top/api/health
```

期望返回：

```json
{"data":{"status":"ok"}}
```

浏览器访问：`https://knowra.qwdream.top/`

服务器本地验证：

```bash
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/knowledge/spaces
pm2 status
```
