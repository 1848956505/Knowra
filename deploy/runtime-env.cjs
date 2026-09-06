function resolveDeploymentEnv(env = process.env) {
  const apiPort = readValue(env.KNOWRA_API_PORT, '3001');
  return {
    apiPort,
    webPort: readValue(env.KNOWRA_WEB_PORT, '3000'),
    apiOrigin: readValue(env.API_ORIGIN, `http://127.0.0.1:${apiPort}`)
  };
}

function readValue(value, fallback) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

module.exports = { resolveDeploymentEnv };
