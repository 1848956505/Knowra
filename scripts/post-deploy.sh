#!/usr/bin/env bash
# post-deploy.sh — 部署/拉取代码后必须执行的一次性收尾脚本
# 解决：apps/web/lib/editor/milkdown-bundle.{js,css} 是 .gitignore 排除的构建产物
#       服务器代码从 git 拉下来时这两个文件不存在，会导致前端 milkdown 404 + 页面空白

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "▶ post-deploy: 生成 milkdown 编辑器 bundle..."

# apps/web/package.json 里的 build:editor-bundle 就是包装 scripts/build-milkdown-bundle.mjs
npm run build:editor-bundle -w @study-accelerator/web

# 如果用 PM2 管理进程，重启 web 让它加载新 bundle（dev 模式无需）
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe study-web >/dev/null 2>&1; then
    echo "▶ post-deploy: 重启 PM2 study-web..."
    pm2 restart study-web --update-env
  fi
fi

echo "✓ post-deploy: 完成"
