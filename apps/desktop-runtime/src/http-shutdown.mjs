/** Node 的 HTTP close 会排空响应，但不会关闭从未发过请求的 TCP 预连接。
 * 只回收零输入且从未进入 request 的连接；部分请求和活动响应仍自然排空。
 * 网络断开不代表异步持久化结束，因此最后另等已接纳的 handler。
 */
export function createHttpShutdown(server, pendingHandlers = new Set()) {
  const unused = new Set();
  let closing;
  server.on('connection', socket => {
    unused.add(socket);
    socket.once('close', () => unused.delete(socket));
    if (closing && socket.bytesRead === 0) socket.destroy();
  });
  server.on('request', request => unused.delete(request.socket));
  return () => {
    if (closing) return closing;
    closing = (async () => {
      await new Promise((resolve, reject) => {
        server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
        for (const socket of unused) if (socket.bytesRead === 0) socket.destroy();
      });
      // 此时已停止接受请求，包含客户端早断开而仍在执行的 handler。
      await Promise.all([...pendingHandlers]);
    })();
    return closing;
  };
}
