process.on('message', message => {
  if (message?.request?.mode === 'crash') process.exit(27);
  if (message?.request?.mode === 'hang') return;
  if (message?.request?.mode === 'spin') { while (true) {} }
  if (message?.request?.mode === 'limit') {
    process.send?.({ type: 'resource', rssBytes: 999_999_999, cpuMs: 0 }); return;
  }
  process.send?.({ type: 'result', id: message.id, result: { ok: true } });
});
