process.on('message', message => {
  if (message?.type === 'run') {
    if (message.request?.mode === 'crash') process.exit(31);
    if (message.request?.mode === 'hang') return;
    if (message.request?.mode === 'credential-probe') {
      process.send?.({ type: 'bridge', id: 1, method: 'credential.resolve',
        args: ['credential-reference', message.jobId, message.request.attemptId] });
      return;
    }
    process.send?.({ type: 'bridge', id: 1, method: 'repository.get', args: ['aiJob', 'another-job'] });
  } else if (message?.type === 'bridgeResult') {
    process.send?.({ type: 'finished', status: 'failed', code: message.error?.code ?? 'AI_BRIDGE_LEAK' });
  }
});
