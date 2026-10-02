#!/usr/bin/env bash
# 仅在一次性Linux CI运行器验证合成容器；不供生产/用户主机执行。
set -Eeuo pipefail
[[ "${CI:-}" == true && "$(uname -s)" == Linux ]] || { echo '只允许一次性Linux CI合成验收。' >&2; exit 2; }
command -v docker >/dev/null
command -v node >/dev/null
docker compose version >/dev/null
root="$(git rev-parse --show-toplevel)"
commit="$(git rev-parse HEAD)"
export KNOWRA_TEST_INSTANCE="ci_${commit:0:10}"
export KNOWRA_TEST_RELEASE="$commit"
export KNOWRA_TEST_PORT=43100
scratch="$(mktemp -d)"
export KNOWRA_TEST_DATABASE_PASSWORD_FILE="$scratch/synthetic-password"
# 纯合成CI库，文件不提交、不上传，执行结束销毁专属CI卷。
printf '%s' 'synthetic-ci-only-do-not-reuse' > "$KNOWRA_TEST_DATABASE_PASSWORD_FILE"
chmod 644 "$KNOWRA_TEST_DATABASE_PASSWORD_FILE"
compose=(docker compose -f "$root/deploy/isolated-test/compose.yml")
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=knowra-acceptance-$KNOWRA_TEST_INSTANCE")" ]] || { echo '发现既有项目，拒绝接管。' >&2; exit 1; }
cleanup() { "${compose[@]}" down --volumes >/dev/null; rm -rf -- "$scratch"; }
trap cleanup EXIT
"${compose[@]}" config --quiet
"${compose[@]}" build migrate
"${compose[@]}" up -d
for attempt in {1..60}; do
  if node -e "fetch('http://127.0.0.1:43100/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then break; fi
  if [[ "$attempt" == 60 ]]; then "${compose[@]}" ps; "${compose[@]}" logs --tail 40 app migrate; exit 1; fi
  sleep 2
done
node "$root/scripts/verify-isolated-instance.mjs" http://127.0.0.1:43100 "$KNOWRA_TEST_INSTANCE"
"${compose[@]}" restart app
for attempt in {1..30}; do
  if node -e "fetch('http://127.0.0.1:43100/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then break; fi
  sleep 2
done
node "$root/scripts/verify-isolated-instance.mjs" http://127.0.0.1:43100 "$KNOWRA_TEST_INSTANCE" --verify-existing
# PG无发布端口、应用只能通过回环访问；卷和网络均为该项目专属。
app_id="$("${compose[@]}" ps -q app)"
db_id="$("${compose[@]}" ps -q postgres)"
docker inspect "$app_id" "$db_id" | node --input-type=module -e '
  import assert from "node:assert/strict";
  let input=""; for await (const chunk of process.stdin) input+=chunk;
  const [app, db]=JSON.parse(input), project="knowra-acceptance-"+process.env.KNOWRA_TEST_INSTANCE;
  assert.deepEqual(app.NetworkSettings.Ports["43100/tcp"], [{HostIp:"127.0.0.1", HostPort:"43100"}]);
  assert(!Object.values(db.NetworkSettings.Ports).some(value=>value?.length));
  for(const item of [app,db]) for(const mount of item.Mounts.filter(x=>x.Type==="volume")) assert(mount.Name.startsWith(project+"_"));
  console.log("仅回环发布、数据库无发布端口及项目专属卷通过。");'
docker network inspect "knowra-acceptance-${KNOWRA_TEST_INSTANCE}_private" --format '{{.Internal}}' | node --input-type=module -e '
  import assert from "node:assert/strict";
  let input=""; for await(const chunk of process.stdin) input+=chunk; assert.equal(input.trim(),"true");'
