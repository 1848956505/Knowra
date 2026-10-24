import assert from 'node:assert/strict';

export const syntheticRequest = (fields = {}) => ({
  modelId: 'synthetic-model',
  messages: [{ role: 'user', content: 'synthetic JSON 中文😀' }],
  maxTokens: 64,
  format: 'text',
  tools: [],
  ...fields
});
export const syntheticTool = () => ({
  name: 'notes_read',
  description: 'synthetic',
  parameters: { type: 'object' }
});

// 字节串先独立手写，再用 Python hashlib.sha256 校验固定 UTF-8 oracle；不从被测函数生成期望值。
export const fixedPayloadOracles = [
  {
    name: 'omitted unknown fields',
    request: () => ({ tools: [] }),
    body: '{"stream":false,"thinking":{"type":"disabled"}}',
    bytes: 47,
    hash: '4e8cb36ba26e26a960da99db49d51f064103f0cdc0e90d22f5a07c037447127a'
  },
  {
    name: 'Unicode default body',
    request: syntheticRequest,
    body: '{"model":"synthetic-model","messages":[{"role":"user","content":"synthetic JSON 中文😀"}],"max_tokens":64,"stream":false,"thinking":{"type":"disabled"}}',
    bytes: 156,
    hash: '7be81ae3640a8f1f31127ef1a67656810c5b703a06428d097b322e5c757f2903'
  },
  {
    name: 'JSON without tools',
    request: () => syntheticRequest({ format: 'json' }),
    body: '{"model":"synthetic-model","messages":[{"role":"user","content":"synthetic JSON 中文😀"}],"max_tokens":64,"stream":false,"thinking":{"type":"disabled"},"response_format":{"type":"json_object"}}',
    bytes: 197,
    hash: 'c7a3104526276492b901f803eff4b43dcb18e5299ba1d16a5f921afd96bc7372'
  },
  {
    name: 'stream usage',
    request: syntheticRequest,
    options: { stream: true },
    body: '{"model":"synthetic-model","messages":[{"role":"user","content":"synthetic JSON 中文😀"}],"max_tokens":64,"stream":true,"thinking":{"type":"disabled"},"stream_options":{"include_usage":true}}',
    bytes: 195,
    hash: '952c6f20bd55ef374610475eb71d4adb0941d7867f7edb66e0adcd4385f2aef0'
  },
  {
    name: 'JSON stream without tools',
    request: () => syntheticRequest({ format: 'json' }),
    options: { stream: true },
    body: '{"model":"synthetic-model","messages":[{"role":"user","content":"synthetic JSON 中文😀"}],"max_tokens":64,"stream":true,"thinking":{"type":"disabled"},"response_format":{"type":"json_object"},"stream_options":{"include_usage":true}}',
    bytes: 236,
    hash: 'f132e9feae878f3fe3702edb29adc161a17d10e637677aa64a0990d501788235'
  },
  {
    name: 'tool suppresses JSON mode',
    request: () => syntheticRequest({ format: 'json', tools: [syntheticTool()] }),
    body: '{"model":"synthetic-model","messages":[{"role":"user","content":"synthetic JSON 中文😀"}],"max_tokens":64,"stream":false,"thinking":{"type":"disabled"},"tools":[{"type":"function","function":{"name":"notes_read","description":"synthetic","parameters":{"type":"object"}}}],"tool_choice":"auto"}',
    bytes: 297,
    hash: 'cdc407a98946d7836d66da77e08ec3ade74b935fdda932f2182a5dcc7e118e28'
  },
  {
    name: 'JSON tools stream',
    request: () => syntheticRequest({ format: 'json', tools: [syntheticTool()] }),
    options: { stream: true },
    body: '{"model":"synthetic-model","messages":[{"role":"user","content":"synthetic JSON 中文😀"}],"max_tokens":64,"stream":true,"thinking":{"type":"disabled"},"tools":[{"type":"function","function":{"name":"notes_read","description":"synthetic","parameters":{"type":"object"}}}],"tool_choice":"auto","stream_options":{"include_usage":true}}',
    bytes: 336,
    hash: '2de5d3c5c5b00d360fa93f5f798e9754c754813d26b95e76de0f20135485e5c8'
  },
  {
    name: 'lone surrogate and distinct Unicode normalization forms',
    request: () => ({ modelId: '\ud800', messages: ['é', 'e\u0301', '🙂'], maxTokens: -0, tools: [] }),
    body: '{"model":"\\ud800","messages":["é","é","🙂"],"max_tokens":0,"stream":false,"thinking":{"type":"disabled"}}',
    bytes: 110,
    hash: 'c49a8efd55ef93e6d54794790fa7b9083ff133f163319738a7abea5f34b591f9'
  }
];

const baseKeys = ['model', 'messages', 'max_tokens', 'stream', 'thinking'];
const sameError = (run, marker) => assert.throws(run, error => error === marker);
const absent = (object, key) => assert.equal(Object.hasOwn(object, key), false, `${key} must be absent`);

// 外部变异与旧新差分直接复用这些闭合用例，不依赖历史 git、工作树布局或 node:test 的注册状态。
export function outboundPayloadContractCases(api) {
  const { deepSeekPayload: payload, serializedDeepSeekPayload: serialized, outboundPayloadHash: hash } = api;
  const cases = [];
  const add = (name, run) => cases.push({ name, run });
  add('three synchronous functions retain export names and arities 1/2/2', () => {
    assert.deepEqual(Object.keys(api).sort(), ['deepSeekPayload', 'outboundPayloadHash', 'serializedDeepSeekPayload']);
    assert.deepEqual([payload.length, serialized.length, hash.length], [1, 2, 2]);
    assert.equal(payload(syntheticRequest()) instanceof Promise, false);
    assert.equal(typeof serialized(syntheticRequest()), 'string');
    assert.equal(typeof hash(syntheticRequest()), 'string');
  });
  for (const fixture of fixedPayloadOracles) {
    add(`fixed independent JSON bytes and SHA-256: ${fixture.name}`, () => {
      assert.equal(serialized(fixture.request(), fixture.options), fixture.body);
      assert.equal(Buffer.byteLength(fixture.body, 'utf8'), fixture.bytes);
      assert.equal(hash(fixture.request(), fixture.options), fixture.hash);
      assert.equal(hash(fixture.request(), fixture.options), fixture.hash);
      assert.match(fixture.hash, /^[0-9a-f]{64}$/);
    });
  }
  add('omitted fields remain own undefined mutable properties before JSON', () => {
    const result = payload({ tools: [] });
    assert.deepEqual(Object.keys(result), baseKeys);
    for (const key of ['model', 'messages', 'max_tokens']) {
      assert.equal(Object.hasOwn(result, key), true);
      assert.equal(result[key], undefined);
      assert.deepEqual(Object.getOwnPropertyDescriptor(result, key), {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    result.model = 'changed';
    assert.equal(result.model, 'changed');
  });
  add('options getter precedes request fields and reads stream only once', () => {
    const trace = [];
    const request = {};
    for (const [key, value] of Object.entries(syntheticRequest()))
      Object.defineProperty(request, key, {
        get() {
          trace.push(key);
          return value;
        }
      });
    payload(request, {
      get stream() {
        trace.push('stream');
        return true;
      }
    });
    assert.deepEqual(trace, ['stream', 'modelId', 'messages', 'maxTokens', 'format', 'tools']);
  });
  add('projection, separate length checks and map retain exact getter order and receiver', () => {
    const trace = [];
    const tool = {};
    const opaque = {};
    const tools = {
      get length() {
        trace.push('length');
        return 1;
      },
      get map() {
        trace.push('map');
        assert.equal(this, tools);
        return function (callback) {
          trace.push('call');
          assert.equal(this, tools);
          assert.equal(arguments.length, 1);
          assert.equal(callback.length, 1);
          assert.deepEqual(callback(tool, 7, tools), { type: 'function', function: tool });
          return opaque;
        };
      }
    };
    const request = {};
    for (const [key, value] of Object.entries(syntheticRequest({ format: 'json', tools })))
      Object.defineProperty(request, key, {
        get() {
          trace.push(key);
          return value;
        }
      });
    const result = payload(request, {
      get stream() {
        trace.push('stream');
        return true;
      }
    });
    assert.equal(result.tools, opaque);
    assert.deepEqual(trace, [
      'stream',
      'modelId',
      'messages',
      'maxTokens',
      'format',
      'tools',
      'length',
      'tools',
      'length',
      'tools',
      'map',
      'call'
    ]);
    assert.deepEqual(Object.keys(result), [...baseKeys, 'tools', 'tool_choice', 'stream_options']);
  });
  add('getter failures stop at each exact access and preserve thrown identity in all exports', () => {
    const order = [
      'stream',
      'modelId',
      'messages',
      'maxTokens',
      'format',
      'tools',
      'length',
      'tools',
      'length',
      'tools',
      'map'
    ];
    for (const invoke of [payload, serialized, hash]) {
      for (let failAt = 0; failAt < order.length; failAt++) {
        const trace = [];
        const marker = { failAt };
        const read = (key, value) => {
          trace.push(key);
          if (trace.length === failAt + 1) throw marker;
          return value;
        };
        const tools = {
          get length() {
            return read('length', 1);
          },
          get map() {
            return read('map', Array.prototype.map);
          }
        };
        const request = {};
        for (const [key, value] of Object.entries(syntheticRequest({ format: 'json', tools })))
          Object.defineProperty(request, key, {
            get() {
              return read(key, value);
            }
          });
        sameError(
          () =>
            invoke(request, {
              get stream() {
                return read('stream', true);
              }
            }),
          marker
        );
        assert.deepEqual(trace, order.slice(0, failAt + 1));
      }
    }
  });
  add('null options throw before touching the request and undefined alone defaults', () => {
    for (const invoke of [payload, serialized, hash]) {
      let reads = 0;
      const request = new Proxy(
        {},
        {
          get() {
            reads++;
            throw new Error('request must remain unread');
          }
        }
      );
      assert.throws(() => invoke(request, null), TypeError);
      assert.equal(reads, 0);
    }
    for (const options of [undefined, {}, { stream: undefined }, 0, false, '', Symbol('options'), 1n])
      assert.equal(serialized(syntheticRequest(), options), fixedPayloadOracles[1].body);
    const options = Object.create({ stream: true });
    assert.equal(payload(syntheticRequest(), options).stream, true);
  });
  add('format is primitive strict json, with no coercion hooks', () => {
    const notJson = {
      [Symbol.toPrimitive]() {
        throw new Error('no format coercion');
      }
    };
    for (const format of [undefined, null, false, 0, '', 'JSON', ' json ', Object('json'), notJson, Symbol('json')])
      absent(payload(syntheticRequest({ format })), 'response_format');
    assert.deepEqual(payload(syntheticRequest({ format: 'json' })).response_format, { type: 'json_object' });
  });
  add('changing tools getter may emit both branches with exact property order', () => {
    let reads = 0;
    const sequence = [[], [syntheticTool()], []];
    const request = syntheticRequest({ format: 'json' });
    Object.defineProperty(request, 'tools', {
      get() {
        return sequence[reads++];
      }
    });
    const result = payload(request, { stream: true });
    assert.equal(reads, 3);
    assert.deepEqual(result.response_format, { type: 'json_object' });
    assert.deepEqual(result.tools, []);
    assert.equal(result.tool_choice, 'auto');
    assert.deepEqual(Object.keys(result), [...baseKeys, 'response_format', 'tools', 'tool_choice', 'stream_options']);
  });
  add('changing tools getter may emit neither branch', () => {
    let reads = 0;
    const request = syntheticRequest({ format: 'json' });
    Object.defineProperty(request, 'tools', {
      get() {
        return [[syntheticTool()], []][reads++];
      }
    });
    const result = payload(request);
    assert.equal(reads, 2);
    assert.deepEqual(Object.keys(result), baseKeys);
  });
  add('separate length getters may also emit both or neither branch without caching', () => {
    for (const lengths of [
      [0, 1],
      [1, 0]
    ]) {
      let reads = 0,
        maps = 0;
      const tools = {
        get length() {
          return lengths[reads++];
        },
        map() {
          maps++;
          return 'opaque';
        }
      };
      const result = payload(syntheticRequest({ format: 'json', tools }));
      assert.equal(reads, 2);
      assert.equal(maps, lengths[1]);
      assert.equal(Object.hasOwn(result, 'response_format'), lengths[0] === 0);
      assert.equal(Object.hasOwn(result, 'tools'), lengths[1] === 1);
    }
  });
  add('length uses only truthiness including objects, symbols and negative values', () => {
    for (const length of [0, -0, NaN, '', null, undefined, false, 0n]) {
      const tools = {
        length,
        get map() {
          throw new Error('map must not be read');
        }
      };
      const result = payload(syntheticRequest({ format: 'json', tools }));
      assert.deepEqual(result.response_format, { type: 'json_object' });
      absent(result, 'tools');
    }
    for (const length of [
      1,
      -1,
      '0',
      [],
      {},
      1n,
      Symbol('length'),
      {
        [Symbol.toPrimitive]() {
          throw new Error('no coercion');
        }
      }
    ]) {
      let calls = 0;
      const tools = {
        length,
        map() {
          calls++;
          assert.equal(this, tools);
          return null;
        }
      };
      const result = payload(syntheticRequest({ format: 'json', tools }));
      assert.equal(result.tools, null);
      assert.equal(calls, 1);
      absent(result, 'response_format');
    }
  });
  add('own array map and custom capability results are opaque, including undefined', () => {
    for (const returned of [undefined, null, false, 0, 'opaque', Symbol('map'), {}, Promise.resolve('opaque')]) {
      const tools = [syntheticTool()];
      let calls = 0;
      tools.map = function (callback) {
        calls++;
        assert.equal(this, tools);
        assert.deepEqual(callback(tools[0]), { type: 'function', function: tools[0] });
        return returned;
      };
      const result = payload(syntheticRequest({ tools }));
      assert.equal(calls, 1);
      assert.equal(Object.hasOwn(result, 'tools'), true);
      assert.equal(result.tools, returned);
      assert.equal(result.tool_choice, 'auto');
    }
  });
  add('map call and callback do not wrap native failures or thrown values', () => {
    const marker = { source: 'custom-map' };
    sameError(
      () =>
        payload(
          syntheticRequest({
            tools: {
              length: 1,
              map() {
                throw marker;
              }
            }
          })
        ),
      marker
    );
    assert.throws(() => payload(syntheticRequest({ tools: { length: 1, map: 42 } })), TypeError);
    assert.throws(() => payload(syntheticRequest({ tools: { length: 1 } })), TypeError);
    absent(payload(syntheticRequest({ tools: { length: 0 } })), 'tools');
  });
  add('third tools read is used only as map receiver, without another length access', () => {
    const marker = {};
    let reads = 0;
    const sequence = [
      [],
      { length: 1 },
      {
        get length() {
          throw new Error('extra length');
        },
        map() {
          assert.equal(this, sequence[2]);
          return marker;
        }
      }
    ];
    const request = syntheticRequest({ format: 'json' });
    Object.defineProperty(request, 'tools', {
      get() {
        return sequence[reads++];
      }
    });
    assert.equal(payload(request).tools, marker);
    assert.equal(reads, 3);
  });
  add('sparse tools preserve holes, repeat identities, order and native JSON null placeholders', () => {
    const tool = {};
    const tools = new Array(5);
    tools[1] = tool;
    tools[3] = tool;
    const result = payload({ tools });
    assert.equal(result.tools.length, 5);
    for (const index of [0, 2, 4]) assert.equal(index in result.tools, false);
    assert.equal(result.tools[1].function, tool);
    assert.equal(result.tools[3].function, tool);
    assert.notEqual(result.tools[1], result.tools[3]);
    assert.equal(
      serialized({ tools }),
      '{"stream":false,"thinking":{"type":"disabled"},"tools":[null,{"type":"function","function":{}},null,{"type":"function","function":{}},null],"tool_choice":"auto"}'
    );
  });
  add('native array map visits inherited indexes and retains species behavior', () => {
    const inheritedTool = {};
    const tools = new Array(2);
    const prototype = Object.create(Array.prototype);
    prototype[0] = inheritedTool;
    Object.setPrototypeOf(tools, prototype);
    const result = payload({ tools });
    assert.equal(result.tools[0].function, inheritedTool);
    assert.equal(1 in result.tools, false);
    class ToolArray extends Array {}
    const subclass = new ToolArray(inheritedTool);
    assert.equal(payload({ tools: subclass }).tools instanceof ToolArray, true);
  });
  add('all tool values are forwarded untouched and callback wrappers are fresh', () => {
    const values = [undefined, null, false, 0, -0, NaN, Infinity, 1n, Symbol('tool'), () => null, {}, []];
    const result = payload({ tools: values });
    values.forEach((value, index) => {
      assert.equal(Object.is(result.tools[index].function, value), true);
      assert.deepEqual(Object.keys(result.tools[index]), ['type', 'function']);
      assert.equal(result.tools[index].type, 'function');
    });
  });
  add('unknown model/messages/tokens fields preserve arbitrary values rather than validating', () => {
    for (const value of [undefined, null, false, 0, -0, NaN, Infinity, 1n, Symbol('field'), () => null, {}, []]) {
      const result = payload({ modelId: value, messages: value, maxTokens: value, tools: [] });
      for (const key of ['model', 'messages', 'max_tokens']) assert.equal(Object.is(result[key], value), true);
    }
  });
  add('frozen input stays aliased while only payload metadata and wrappers are fresh', () => {
    const tool = Object.freeze(syntheticTool());
    const messages = Object.freeze([{ role: 'user', content: 'synthetic' }]);
    const request = Object.freeze(syntheticRequest({ messages, tools: Object.freeze([tool, tool]) }));
    const a = payload(request, { stream: true }),
      b = payload(request, { stream: true });
    assert.equal(a.messages, messages);
    assert.equal(a.tools[0].function, tool);
    assert.notEqual(a, b);
    assert.notEqual(a.thinking, b.thinking);
    assert.notEqual(a.tools, b.tools);
    assert.notEqual(a.tools[0], a.tools[1]);
    assert.notEqual(a.tools[0], b.tools[0]);
    assert.notEqual(a.stream_options, b.stream_options);
    a.tools.push({ type: 'function', function: null });
    a.thinking.type = 'changed';
    assert.equal(request.tools.length, 2);
    assert.equal(b.thinking.type, 'disabled');
    const jsonRequest = syntheticRequest({ format: 'json' });
    assert.notEqual(payload(jsonRequest).response_format, payload(jsonRequest).response_format);
  });
  add('payload aliases observe later mutations instead of snapshotting messages or tools', () => {
    const request = syntheticRequest({ tools: [syntheticTool()] });
    const result = payload(request);
    request.messages[0].content = 'later';
    request.tools[0].name = 'later-tool';
    assert.equal(result.messages[0].content, 'later');
    assert.equal(result.tools[0].function.name, 'later-tool');
  });
  add('nonboolean runtime stream values are preserved and branch only by truthiness', () => {
    for (const stream of [null, 0, -0, NaN, '', false, 0n]) {
      const result = payload(syntheticRequest(), { stream });
      assert.equal(Object.is(result.stream, stream), true);
      absent(result, 'stream_options');
    }
    for (const stream of ['false', 1, -1, {}, [], Object(false), Symbol('stream'), 1n]) {
      const result = payload(syntheticRequest(), { stream });
      assert.equal(result.stream, stream);
      assert.deepEqual(result.stream_options, { include_usage: true });
    }
    assert.equal(
      serialized({ tools: [] }, { stream: 'false' }),
      '{"stream":"false","thinking":{"type":"disabled"},"stream_options":{"include_usage":true}}'
    );
    assert.equal(serialized({ tools: [] }, { stream: null }), '{"stream":null,"thinking":{"type":"disabled"}}');
  });
  add('unselected secrets, request toJSON, symbols and ownKeys are never read', () => {
    const request = syntheticRequest();
    for (const key of ['apiKey', 'credentialRef', 'signal', 'sourceRefs', 'private', 'toJSON', Symbol('private')])
      Object.defineProperty(request, key, {
        enumerable: true,
        get() {
          throw new Error(`unselected ${String(key)}`);
        }
      });
    const proxy = new Proxy(request, {
      ownKeys() {
        throw new Error('request enumeration');
      }
    });
    assert.equal(serialized(proxy), fixedPayloadOracles[1].body);
    assert.equal(hash(proxy), fixedPayloadOracles[1].hash);
    assert.deepEqual(Object.keys(payload(proxy)), baseKeys);
  });
  add('inherited selected fields are read normally without enumerating the request', () => {
    const parent = syntheticRequest();
    const result = payload(Object.create(parent));
    assert.equal(result.messages, parent.messages);
    assert.equal(result.model, parent.modelId);
  });
  add('native malformed request errors are not defaulted or replaced', () => {
    for (const request of [undefined, null, {}, { tools: null }, { tools: undefined }, 1, true, 'text']) {
      assert.throws(() => payload(request), TypeError);
      assert.throws(() => serialized(request), TypeError);
      assert.throws(() => hash(request), TypeError);
    }
  });
  add('JSON native omission/null/number/property-order rules are not normalized', () => {
    assert.equal(
      serialized({ modelId: Symbol('m'), messages: () => null, maxTokens: undefined, tools: [] }),
      fixedPayloadOracles[0].body
    );
    assert.equal(
      serialized({
        modelId: NaN,
        messages: [undefined, Symbol('m'), () => null, NaN, Infinity, -Infinity, -0],
        maxTokens: Infinity,
        tools: [undefined, Symbol('t'), () => null]
      }),
      '{"model":null,"messages":[null,null,null,null,null,null,0],"max_tokens":null,"stream":false,"thinking":{"type":"disabled"},"tools":[{"type":"function"},{"type":"function"},{"type":"function"}],"tool_choice":"auto"}'
    );
    assert.equal(
      serialized({ messages: { z: 1, 2: 'two', 1: 'one', a: 2 }, tools: [] }),
      '{"messages":{"1":"one","2":"two","z":1,"a":2},"stream":false,"thinking":{"type":"disabled"}}'
    );
  });
  add('JSON invokes nested toJSON after projection, in field order, with original receivers and keys', () => {
    const trace = [];
    const value = name => {
      const object = {
        get toJSON() {
          assert.equal(this, object);
          trace.push(`get:${name}`);
          return function (key) {
            assert.equal(this, object);
            trace.push(`${name}:${key}`);
            return name;
          };
        }
      };
      return object;
    };
    const request = {
      modelId: value('model'),
      messages: value('messages'),
      maxTokens: value('tokens'),
      tools: [value('tool')]
    };
    payload(request);
    assert.deepEqual(trace, []);
    assert.equal(
      serialized(request),
      '{"model":"model","messages":"messages","max_tokens":"tokens","stream":false,"thinking":{"type":"disabled"},"tools":[{"type":"function","function":"tool"}],"tool_choice":"auto"}'
    );
    assert.deepEqual(trace, [
      'get:model',
      'model:model',
      'get:messages',
      'messages:messages',
      'get:tokens',
      'tokens:max_tokens',
      'get:tool',
      'tool:function'
    ]);
  });
  add('JSON Date, boxed primitives and toJSON omission retain native behavior', () => {
    const request = {
      modelId: new Date('2026-01-02T03:04:05Z'),
      messages: [
        Object(3),
        Object('x'),
        Object(false),
        {
          toJSON() {
            return undefined;
          }
        }
      ],
      maxTokens: {
        toJSON() {
          return undefined;
        }
      },
      tools: []
    };
    assert.equal(
      serialized(request),
      '{"model":"2026-01-02T03:04:05.000Z","messages":[3,"x",false,null],"stream":false,"thinking":{"type":"disabled"}}'
    );
  });
  add('JSON BigInt and cycles fail only at serialization and errors are not wrapped', () => {
    const cycle = {};
    cycle.self = cycle;
    for (const value of [1n, cycle]) {
      for (const field of ['modelId', 'messages', 'maxTokens']) {
        const request = { tools: [], [field]: value };
        assert.equal(
          payload(request)[{ modelId: 'model', messages: 'messages', maxTokens: 'max_tokens' }[field]],
          value
        );
        assert.throws(() => serialized(request), TypeError);
        assert.throws(() => hash(request), TypeError);
      }
      assert.throws(() => serialized({ tools: [value] }), TypeError);
      assert.throws(() => hash({ tools: [value] }), TypeError);
    }
    for (const getter of [false, true]) {
      const marker = { source: 'toJSON' };
      const value = getter
        ? Object.defineProperty({}, 'toJSON', {
            get() {
              throw marker;
            }
          })
        : {
            toJSON() {
              throw marker;
            }
          };
      sameError(() => serialized({ messages: value, tools: [] }), marker);
      sameError(() => hash({ messages: value, tools: [] }), marker);
    }
  });
  add('each wrapper serializes only once, preserving getter and toJSON call counts', () => {
    for (const invoke of [serialized, hash]) {
      const trace = [];
      const request = {
        get modelId() {
          trace.push('model');
          return 'm';
        },
        get messages() {
          trace.push('messages');
          return {
            toJSON(key) {
              trace.push(`toJSON:${key}`);
              return 'm';
            }
          };
        },
        get maxTokens() {
          trace.push('maxTokens');
          return 1;
        },
        get format() {
          trace.push('format');
          return 'text';
        },
        get tools() {
          trace.push('tools');
          return [];
        }
      };
      invoke(request, {
        get stream() {
          trace.push('stream');
          return false;
        }
      });
      assert.deepEqual(trace, ['stream', 'model', 'messages', 'maxTokens', 'format', 'tools', 'toJSON:messages']);
    }
  });
  // 修改全局 intrinsic/prototype 的逃逸不属于静态 string 合同的正常支持域；仅固定旧 JS 的病理运行行为。
  add('inherited Object.prototype.toJSON pathology remains native outside supported intrinsic domain', () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
    const trace = [];
    try {
      Object.defineProperty(Object.prototype, 'toJSON', {
        configurable: true,
        value(key) {
          trace.push(key);
          return undefined;
        }
      });
      const result = payload({ tools: [] });
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.deepEqual(trace, []);
      assert.equal(serialized({ tools: [] }), undefined);
      assert.deepEqual(trace, ['']);
      assert.throws(() => hash({ tools: [] }), TypeError);
      assert.deepEqual(trace, ['', '']);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'toJSON', previous);
      else delete Object.prototype.toJSON;
    }
  });
  return cases;
}

export function assertOutboundPayloadContract(api) {
  const names = [];
  for (const entry of outboundPayloadContractCases(api)) {
    entry.run();
    names.push(entry.name);
  }
  return names;
}

// 有序、可 JSON 化的实际观察，供外部准确父提交/候选及变异诊断使用。
export function captureOutboundPayloadObservations(api) {
  const observations = fixedPayloadOracles.map(fixture => ({
    name: fixture.name,
    keys: Object.keys(api.deepSeekPayload(fixture.request(), fixture.options)),
    body: api.serializedDeepSeekPayload(fixture.request(), fixture.options),
    hash: api.outboundPayloadHash(fixture.request(), fixture.options)
  }));
  for (const sequence of [
    [[], [{}], []],
    [[{}], []]
  ]) {
    const trace = [];
    let read = 0;
    const request = {
      modelId: 'm',
      messages: [],
      maxTokens: 1,
      format: 'json',
      get tools() {
        trace.push(`tools:${++read}`);
        return sequence[read - 1];
      }
    };
    const result = api.deepSeekPayload(request, {
      get stream() {
        trace.push('stream');
        return true;
      }
    });
    observations.push({
      name: `changing-tools:${observations.length}`,
      trace,
      keys: Object.keys(result),
      body: JSON.stringify(result)
    });
  }
  return observations;
}
