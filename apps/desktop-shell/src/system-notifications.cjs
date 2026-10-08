/**
 * 系统通知由主进程发出：窗口会话的权限处理器会拒绝渲染进程的 Notification 权限，
 * 所以渲染进程只能通过受控的 IPC 请求主进程，主进程再按系统是否支持来发送，并如实返回结果。
 * 只接受很短的纯文本标题与正文，不接受链接、图标或点击动作。
 */
const MAX_TITLE = 80;
const MAX_BODY = 240;

function createSystemNotifications({ Notification }) {
  return {
    /** 返回 true 表示已交给系统通知中心；系统不支持或参数无效时返回 false，由调用方决定是否重试。 */
    notify(input) {
      const { title, body } = input ?? {};
      if (typeof title !== 'string' || typeof body !== 'string' || !title.trim() || title.length > MAX_TITLE || body.length > MAX_BODY
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title + body)) return false;
      try {
        if (!Notification.isSupported()) return false;
        new Notification({ title, body, silent: false }).show();
        return true;
      } catch { return false; }
    }
  };
}

module.exports = { createSystemNotifications };
