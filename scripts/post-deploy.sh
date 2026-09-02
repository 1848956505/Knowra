#!/usr/bin/env bash
# post-deploy.sh — 部署/拉取代码后构建 V4 并刷新正式进程

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

V4_DIST_DIR="${KNOWRA_V4_DIST_DIR:-apps/web-v4/dist}"

echo "▶ post-deploy: 构建 V4 前端..."
NODE_ENV=production npm run build:web
test -f "$V4_DIST_DIR/index.html"
if find "$V4_DIST_DIR" -type f -name '*.map' -print -quit | grep -q .; then
  printf '%s\n' '✗ post-deploy: V4 生产产物不应包含 Source Map' >&2
  exit 1
fi

# 如果用 PM2 管理进程，校验并重启正式服务（dev 模式无需）
if command -v pm2 >/dev/null 2>&1; then
  for process_name in knowra-api knowra-web; do
    if ! pm2 describe "$process_name" >/dev/null 2>&1; then
      printf '✗ post-deploy: 未找到 PM2 进程 %s\n' "$process_name" >&2
      exit 1
    fi
  done

  echo "▶ post-deploy: 将 PM2 入口刷新为 API + V4 Web..."
  pm2 startOrReload deploy/ecosystem.config.cjs --update-env
  pm2 save
fi

echo "✓ post-deploy: 完成"
