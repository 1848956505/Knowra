import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { writeJsonFileAtomically as writer, type FilePort } from '../src/infrastructure/atomic-json-file.ts';
import { jsonChunks } from '../src/infrastructure/json-chunks.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type IteratorStillHonest = Assert<
  Equal<ReturnType<typeof jsonChunks>, Generator<string | undefined, void, unknown>>
>;
declare const data: unknown;
const native: FilePort<number> = fs;
writer('/compile-only', data);
writer('/compile-only', data, undefined);
writer('/compile-only', data, { fileSystem: native, createUniqueId: randomUUID });
writer('/compile-only', data, {
  beforeCommit: function (this: undefined) {
    return this;
  }
});
writer('/compile-only', data, {
  createUniqueId: function (this: undefined) {
    return this;
  }
});
writer('/compile-only', data, { beforeCommit: () => false });
writer('/compile-only', data, { beforeCommit: () => Promise.resolve(true) });
writer('/compile-only', data, {
  beforeCommit: () => ({ then: Symbol('truthy') }),
  createUniqueId: () => Symbol('throws')
});
writer('/compile-only', data, { beforeCommit: null, createUniqueId: () => 17 });
writer('/compile-only', data, { createUniqueId: () => 'fixed' });
const token = Symbol('fd');
const generic: FilePort<typeof token> = {
  mkdirSync() {
    return Promise.resolve();
  },
  openSync() {
    return token;
  },
  writeFileSync(fd, data) {
    const correct: typeof token = fd;
    return { correct, data };
  },
  fsyncSync(fd) {
    return fd;
  },
  closeSync(fd) {
    return fd;
  },
  renameSync() {
    return null;
  },
  existsSync() {
    return 'truthy';
  },
  rmSync() {
    return false;
  }
};
writer('/compile-only', data, { fileSystem: generic });
writer<typeof token>('/compile-only', data, { fileSystem: generic });
writer('/compile-only', data, {
  fileSystem: {
    mkdirSync() {},
    openSync(): typeof token {
      return token;
    },
    writeFileSync(fd: typeof token, _data: string, _encoding: 'utf8') {
      return fd;
    },
    fsyncSync(fd: typeof token) {
      return fd;
    },
    closeSync(fd: typeof token) {
      return fd;
    },
    renameSync() {},
    existsSync() {
      return 0;
    },
    rmSync() {}
  }
});
writer('/compile-only', data, {
  fileSystem: {
    mkdirSync() {},
    openSync() {
      return 17;
    },
    writeFileSync(fd) {
      const n: number = fd;
      return n;
    },
    fsyncSync(fd) {
      const n: number = fd;
      return n;
    },
    closeSync(fd) {
      const n: number = fd;
      return n;
    },
    renameSync() {},
    existsSync() {
      return 0;
    },
    rmSync() {}
  }
});

// 真实 JS 消费入口的声明继续接线；其函数体尚未纳入 strict，不宣称端到端安全。
import { writeJsonFileAtomically as bridge } from '../src/infrastructure/atomic-json-file.js';
import { createFileDataStore } from '../src/infrastructure/file-data-store.js';
import { createAttachmentCleanupQueue } from '../src/infrastructure/attachment-cleanup-queue.js';
import { createAppContext } from '../src/app.factory.js';
import { createPostgresAppContext } from '../src/postgres-app.factory.js';
import type { Hooks, Options } from '../src/infrastructure/atomic-json-file.ts';
const store = createFileDataStore('/compile-only/not-executed.json', { writeJson: writer });
const queue = createAttachmentCleanupQueue({ storageRootDir: '/compile-only', fileManager: {} });
const local = createAppContext();
const postgres = createPostgresAppContext();
const objectPort: FilePort<{ descriptor: symbol }> = {
  ...generic,
  openSync() {
    return { descriptor: token };
  },
  writeFileSync(fd, chunk, encoding) {
    return [fd.descriptor, chunk, encoding];
  },
  fsyncSync(fd) {
    return fd.descriptor;
  },
  closeSync(fd) {
    return fd.descriptor;
  }
};
writer('/compile-only', data, { fileSystem: objectPort });
bridge('/compile-only', data, { fileSystem: objectPort });
const promisePort: FilePort<Promise<number>> = {
  ...generic,
  openSync() {
    return Promise.resolve(17);
  },
  writeFileSync(fd) {
    return fd;
  },
  fsyncSync(fd) {
    return fd;
  },
  closeSync(fd) {
    return fd;
  }
};
writer('/compile-only', data, { fileSystem: promisePort });
const unionPort: FilePort<number | symbol> = {
  ...generic,
  openSync() {
    return Math.random() ? 17 : token;
  },
  writeFileSync(fd) {
    return fd;
  },
  fsyncSync(fd) {
    return fd;
  },
  closeSync(fd) {
    return fd;
  }
};
writer('/compile-only', data, { fileSystem: unionPort });
writer<number | symbol>('/compile-only', data, { fileSystem: unionPort });
const unknownPort: FilePort<unknown> = {
  ...generic,
  openSync() {
    return data;
  },
  writeFileSync(fd) {
    return fd;
  },
  fsyncSync(fd) {
    return fd;
  },
  closeSync(fd) {
    return fd;
  }
};
writer('/compile-only', data, { fileSystem: unknownPort });
const undefinedPort: FilePort<undefined> = {
  ...generic,
  openSync() {
    return undefined;
  },
  writeFileSync(fd) {
    return fd;
  },
  fsyncSync(fd) {
    return fd;
  },
  closeSync(fd) {
    return fd;
  }
};
writer('/compile-only', data, { fileSystem: undefinedPort });
writer('/compile-only', data, { fileSystem: undefined, createUniqueId: undefined, beforeCommit: undefined });
const detached: Hooks = {
  beforeCommit: function (this: undefined) {
    return this;
  },
  createUniqueId: () => data
};
const nativeOptions: Options<number> = { ...detached, fileSystem: fs };
writer('/compile-only', data, nativeOptions);
type IsAny<T> = 0 extends 1 & T ? true : false;
export type AtomicJsonContracts = [
  Assert<Equal<typeof bridge, typeof writer>>,
  Assert<Equal<ReturnType<typeof writer>, void>>,
  Assert<Equal<Parameters<typeof writer>[0], string>>,
  Assert<Equal<Parameters<typeof writer>[1], unknown>>,
  Assert<Equal<ReturnType<FilePort<symbol>['openSync']>, symbol>>,
  Assert<Equal<Parameters<FilePort<symbol>['writeFileSync']>[0], symbol>>,
  Assert<Equal<Parameters<FilePort<symbol>['writeFileSync']>[1], string>>,
  Assert<Equal<Parameters<FilePort<symbol>['fsyncSync']>[0], symbol>>,
  Assert<Equal<Parameters<FilePort<symbol>['closeSync']>[0], symbol>>,
  Assert<Equal<ReturnType<FilePort<symbol>['existsSync']>, unknown>>,
  Assert<Equal<ReturnType<NonNullable<Hooks['beforeCommit']>>, unknown>>,
  Assert<Equal<ReturnType<NonNullable<Hooks['createUniqueId']>>, unknown>>,
  Assert<Equal<ThisParameterType<NonNullable<Hooks['beforeCommit']>>, undefined>>,
  Assert<Equal<ThisParameterType<NonNullable<Hooks['createUniqueId']>>, undefined>>,
  Assert<Equal<IsAny<Parameters<typeof writer>[0]>, false>>,
  Assert<Equal<IsAny<Parameters<typeof writer>[1]>, false>>,
  Assert<Equal<IsAny<ReturnType<FilePort<unknown>['openSync']>>, false>>
];
void [store, queue, local, postgres];
