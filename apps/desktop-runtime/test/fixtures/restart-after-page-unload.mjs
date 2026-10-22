/** 先卸载旧页面的轮询，再允许 fixture 重启并切换 origin。 */
export async function restartAfterPageUnload(page, fixture) {
  await page.goto('about:blank');
  return fixture.restart();
}
