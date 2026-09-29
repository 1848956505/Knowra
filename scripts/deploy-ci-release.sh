#!/usr/bin/env bash
# 在运维 Mac 上取得通过 CI 的 Linux 发布包并交给 ECS 激活。
set -Eeuo pipefail

if [[ $# -ne 2 || ! "$1" =~ ^[0-9a-f]{40}$ || ! "$2" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$ ]]; then
  echo '用法：deploy-ci-release.sh <main的40位提交SHA> <SSH用户@主机>' >&2
  exit 2
fi

commit="$1"
host="$2"
root=/opt/knowra
repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
main_commit="$(gh api "repos/$repo/git/ref/heads/main" --jq '.object.sha')"
[[ "$main_commit" == "$commit" ]] || {
  echo '只允许发布 GitHub main 当前提交。' >&2
  exit 1
}
run_id="$(gh run list --repo "$repo" --workflow ci.yml --branch main --commit "$commit" --event push --status success --limit 10 --json databaseId --jq '.[0].databaseId // empty')"
[[ "$run_id" =~ ^[0-9]+$ ]] || {
  echo '没有找到该 main 提交通过全部门禁的 CI 运行。' >&2
  exit 1
}

artifact="knowra-linux-release-$commit"
archive="knowra-release-$commit.tar.gz"
download_dir="$(mktemp -d)"
trap 'rm -rf -- "$download_dir"' EXIT
gh run download "$run_id" --repo "$repo" --name "$artifact" --dir "$download_dir"
(
  cd "$download_dir"
  shasum -a 256 -c "$archive.sha256"
)

remote_dir="$root/.deploy-incoming/$commit-$run_id-$(date +%s)"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$host" \
  "mkdir -p '$root/.deploy-incoming' && mkdir '$remote_dir'"
scp -o BatchMode=yes -o StrictHostKeyChecking=yes \
  "$download_dir/$archive" "$download_dir/$archive.sha256" "$host:$remote_dir/"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$host" \
  "cd '$remote_dir' && sha256sum -c '$archive.sha256' && mkdir stage && tar --no-same-owner -xzf '$archive' -C stage && bash stage/scripts/activate-ci-release.sh '$root' '$commit' '$remote_dir/stage'"
