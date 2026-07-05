# 阿里云 ECS 服务器信息

更新时间：2026-07-04

本文档用于在其他设备上的 Codex 继续接入和维护当前 Study Accelerator 服务器。不要在本文档中保存私钥、服务器密码、API Key 或其他明文密钥。

## 基础信息

- 云厂商：阿里云
- 服务器类型：ECS
- 操作系统：Ubuntu 22.04.5 LTS
- 主机名：`iZ2ze79rc2xe67bwj2jq4gZ`
- 公网 IP：`47.95.236.184`
- 内网 IP：`172.26.73.107`
- SSH 用户：`root`
- SSH 端口：`22`
- 公网访问地址：`http://47.95.236.184/`
- 健康检查地址：`http://47.95.236.184/api/health`

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
/opt/study-accelerator
```

当前部署方式：

- Node.js monorepo
- 前端服务：`apps/web/src/main.js`
- 后端服务：`apps/api/src/main.js`
- 进程管理：PM2
- 反向代理：Nginx
- 对外端口：`80`

## 运行时服务

Node.js 和 npm：

```text
Node.js: v24.18.0
npm: 11.16.0
```

PM2 服务：

```text
study-api  -> /opt/study-accelerator/apps/api/src/main.js, PORT=3001
study-web  -> /opt/study-accelerator/apps/web/src/main.js, PORT=3000, API_ORIGIN=http://127.0.0.1:3001
```

常用命令：

```bash
pm2 status
pm2 logs study-api
pm2 logs study-web
pm2 restart study-api study-web --update-env
pm2 save
```

## 部署流程

代码用 git 部署时必须分两步：**拉代码 → 跑 post-deploy**。后者必须执行，因为
`apps/web/lib/editor/milkdown-bundle.{js,css}` 是 `.gitignore` 排除的构建产物，
git 拉下来的代码里没有它们，会导致前端 `/lib/editor/milkdown-bundle.js` 404、
页面整体空白、按钮无反应。

```bash
cd /opt/study-accelerator

# 1. 拉取新代码
git pull

# 2. 必要时更新依赖
npm install

# 3. 必须跑：生成 milkdown bundle + 重启 PM2 study-web
./scripts/post-deploy.sh
```

`scripts/post-deploy.sh` 等价于：

```bash
npm run build:editor-bundle -w @study-accelerator/web
pm2 restart study-web --update-env
```

> 经验教训：2026-07-05 的 404 事件就是因为部署只跑了 `git pull` + `pm2 restart`，
> 忘了重新生成 bundle，PM2 起来后发现 bundle 不存在，前端 50% 资源加载失败。
> 现在把 build 步骤收进 `scripts/post-deploy.sh` 避免再犯。

## Nginx 配置

当前配置文件：

```text
/etc/nginx/sites-available/study-accelerator
```

当前核心配置：

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

说明：

- `server_name _;` 表示不写死公网 IP，以后绑定域名或更换 IP 时不需要改项目代码。
- 浏览器访问公网地址后，前端请求使用相对路径 `/api/...`。
- 前端服务内部再把 `/api/...` 代理到 `http://127.0.0.1:3001`。

检查和重启 Nginx：

```bash
nginx -t
systemctl restart nginx
systemctl status nginx
```

## 数据路径

当前统一的活跃数据文件：

```text
/opt/study-accelerator/storage/data/knowledge-base.json
```

本地对应路径：

```text
storage/data/knowledge-base.json
```

历史原因：旧数据曾位于 `apps/api/storage/data/knowledge-base.json`。现在运行时统一读取根目录下的 `storage/data/knowledge-base.json`，本地与服务器都应保持这个路径为准。

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

当前服务仍是临时公开测试状态：

- 目前是 HTTP，不是 HTTPS。
- 当前项目还没有登录鉴权。
- 只要知道公网 IP，别人理论上可以访问页面和 API。
- 不要把私钥、密码、云账号凭据写入仓库或本文档。

后续建议：

1. 增加登录系统，并保护所有 `/api/*` 接口。
2. 绑定域名并启用 HTTPS。
3. 创建非 root 的部署用户，例如 `deploy`。
4. 关闭 root SSH 登录或限制 root 登录来源。
5. 定期备份 `storage/data/knowledge-base.json` 和 `storage/uploads/`。

## 快速验证

在任意能联网的机器上执行：

```bash
curl http://47.95.236.184/api/health
```

期望返回：

```json
{"data":{"status":"ok"}}
```

服务器本地验证：

```bash
curl http://127.0.0.1/api/health
curl http://127.0.0.1/api/knowledge/spaces
pm2 status
```
