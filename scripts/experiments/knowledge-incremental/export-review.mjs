#!/usr/bin/env node
// 仅本地转换；无 provider / 网络 / 正式存储入口，输出必须是新文件。
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REVIEW_LIMITS, ReviewContractError } from '../../../packages/shared/src/incremental-review.js';
import { createReviewEnvelope } from './review-envelope.mjs';

export const MAX_REVIEW_SOURCE_BYTES = REVIEW_LIMITS.bytes;
export async function exportReviewFile({ input, output, reportId }) {
  if (typeof input !== 'string' || typeof output !== 'string' || resolve(input) === resolve(output)) throw Error('review-file-paths');
  const file = await open(input, 'r'); let raw;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_REVIEW_SOURCE_BYTES) throw Error('review-source-size');
    // 有界读取，即使 stat 后文件增长也不分配无限内存。
    const buffer = Buffer.alloc(MAX_REVIEW_SOURCE_BYTES + 1); let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break; length += bytesRead;
    }
    if (length > MAX_REVIEW_SOURCE_BYTES) throw Error('review-source-size');
    raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await file.close(); }
  let source; try { source = JSON.parse(raw); } catch { throw Error('review-source-json'); }
  const envelope = createReviewEnvelope(source, { reportId });
  const serialized = JSON.stringify(envelope);
  const destination = await open(output, 'wx', 0o600);
  try { await destination.writeFile(serialized, 'utf8'); } finally { await destination.close(); }
  return { rows: envelope.rows.length, proposals: envelope.rows.reduce((sum, row) => sum + row.proposals.length, 0), bytes: Buffer.byteLength(serialized) };
}
export async function main(args) {
  if (args.length !== 6 || args[0] !== '--input' || args[2] !== '--output' || args[4] !== '--report-id') throw Error('usage: --input FILE --output NEW_FILE --report-id ID');
  const summary = await exportReviewFile({ input: args[1], output: args[3], reportId: args[5] });
  console.log(JSON.stringify(summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    // 不输出原文、供应商消息或用户路径。
    console.error(error instanceof ReviewContractError ? `review-contract: ${error.path}: ${error.code}` : 'review-export-failed');
    process.exitCode = 1;
  });
}
