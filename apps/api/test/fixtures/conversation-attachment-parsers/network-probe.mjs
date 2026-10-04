import { disableParserNetwork } from '../../../src/modules/ai/conversation-attachment-parsers/offline-guard.mjs';
import { failed } from '../../../src/modules/ai/conversation-attachment-parsers/limits.mjs';
import http from 'node:http';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks), separator = input.indexOf(10);
const url = input.subarray(separator + 1).toString('utf8');
disableParserNetwork();
try { http.get(url); }
catch (error) { process.stdout.write(JSON.stringify(failed('text', error.code))); }
