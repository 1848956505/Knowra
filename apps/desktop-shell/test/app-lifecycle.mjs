import fs from 'node:fs';
// 仅用于由当前测试 electron.launch 返回的进程；不查找名称，也不接触用户的 APP。
export async function closeTestApplication(application, { closeTimeoutMs = 45000, exitTimeoutMs = 5000, killGroup = pid => process.kill(-pid, 'SIGKILL') } = {}) {
  if (!application) return;
  const child = application.process();
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  if (exited()) return;
  const wait = ms => new Promise(resolve => {
    const done = () => { clearTimeout(timer); child.removeListener('exit', done); resolve(true); };
    const timer = setTimeout(() => { child.removeListener('exit', done); resolve(false); }, ms);
    child.once('exit', done);
    if (exited()) done();
  });
  const graceful = wait(closeTimeoutMs);
  // app.close 可能因保存失败对话框而不返回；最终以测试专属进程退出事件为准。
  void Promise.resolve().then(() => application.close()).catch(() => {});
  if (await graceful) return;
  console.error(`[Mac 验收] 测试进程 ${child.pid} 正常关闭超时；仅清理该 launch 的进程，当前测试判为失败。`);
  const stopped = wait(exitTimeoutMs);
  killGroup(child.pid);
  if (!await stopped) throw new Error(`测试 APP 进程 ${child.pid} 清理失败；保留合成目录供诊断。`);
  throw new Error(`测试 APP 进程 ${child.pid} 未在 ${closeTimeoutMs}ms 内正常退出，已强制清理；不计为退出握手通过。`);
}

// Playwright 在 macOS 为 Electron 单独创建进程组。登记实际 launch 返回的 PID，
// 使外层测试超时也能找到自己的 APP，而不是错误地只清理 node:test 进程组。
export async function launchTestApplication(electron, options) {
  const application = await electron.launch(options);
  const child = application.process();
  const registry = process.env.KNOWRA_TEST_PROCESS_REGISTRY;
  if (registry) {
    const record = state => fs.appendFileSync(registry, `${JSON.stringify({ pid: child.pid, state })}\n`);
    record('launched');
    child.once('exit', () => record('exited'));
  }
  console.log(`[Mac 验收] 启动测试专属 APP pid=${child.pid}`);
  return application;
}
