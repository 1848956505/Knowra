import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { listenOnConfiguredPort } from '../configured-port-listener.js';

test('production listener fails on the configured port instead of falling back', async () => {
  const server = new FakeServer(new Set([3000]));

  await assert.rejects(
    listenOnConfiguredPort(server, 3000, { allowPortFallback: false }),
    (error) => error.code === 'EADDRINUSE' && /refusing to select another port/.test(error.message)
  );
  assert.deepEqual(server.attemptedPorts, [3000]);
});

test('development listener may select the next available port', async () => {
  const server = new FakeServer(new Set([3000, 3001]));

  const port = await listenOnConfiguredPort(server, 3000, { allowPortFallback: true });

  assert.equal(port, 3002);
  assert.deepEqual(server.attemptedPorts, [3000, 3001, 3002]);
});

class FakeServer extends EventEmitter {
  constructor(occupiedPorts) {
    super();
    this.occupiedPorts = occupiedPorts;
    this.attemptedPorts = [];
  }

  listen(port, _host, callback) {
    this.attemptedPorts.push(port);
    if (this.occupiedPorts.has(port)) {
      const error = new Error(`Port ${port} is occupied`);
      error.code = 'EADDRINUSE';
      queueMicrotask(() => this.emit('error', error));
      return;
    }
    queueMicrotask(callback);
  }
}
