import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AppError } from '../src/errors/app-error.js';
import { parseBody } from '../src/http/request.js';

function createRequest({ contentType = 'application/json', chunks = [] } = {}) {
  const request = new EventEmitter();
  request.headers = { 'content-type': contentType };
  request.destroy = () => {};

  queueMicrotask(() => {
    for (const chunk of chunks) {
      request.emit('data', Buffer.from(chunk));
    }
    request.emit('end');
  });

  return request;
}

export const httpRequestTests = [
  {
    name: 'parseBody rejects JSON bodies over the configured size limit',
    async run() {
      await assert.rejects(
        () => parseBody(createRequest({ chunks: ['{"name":"too-large"}'] }), { limitBytes: 4 }),
        (error) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.statusCode, 413);
          assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
          return true;
        }
      );
    }
  },
  {
    name: 'parseBody rejects non-JSON request bodies',
    async run() {
      await assert.rejects(
        () => parseBody(createRequest({ contentType: 'text/plain', chunks: ['plain text'] })),
        (error) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.statusCode, 415);
          assert.equal(error.code, 'UNSUPPORTED_MEDIA_TYPE');
          return true;
        }
      );
    }
  }
];
