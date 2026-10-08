const HEADER = ['时间', '北京日期', '状态', '模型', '输入token', '输出token', '缓存命中token', '费用或占用(元)', '对话ID', '价格版本', '尝试ID'];
const STATUS = { settled: '已结算', unknown: '结果未知(按预留占用)' };
const yuan = microunits => (microunits / 1_000_000).toFixed(6);

/** 以 = + - @ 开头（或制表/回车）的单元格加前缀，避免被表格软件当成公式执行。 */
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const line = values => values.map(cell).join(',');

/**
 * 用量明细 CSV：只含时间、模型、token、费用、状态和对话/尝试 ID，不含对话内容。
 * 90 天以前的明细已折叠为月汇总，以“月汇总”行附在末尾，累计金额不变。
 */
export function usageCsv({ rows, months }) {
  const lines = [line(HEADER)];
  for (const row of rows) {
    lines.push(line([row.at, row.day, STATUS[row.status], row.modelId, row.inputTokens, row.outputTokens, row.cacheHitTokens,
      yuan(row.costMicrounits), row.conversationId, row.priceVersion, row.attemptId]));
  }
  for (const month of months) {
    lines.push(line([`${month.month} 月汇总(明细已折叠)`, month.month, `${month.requests} 次请求`, '', month.inputTokens, month.outputTokens,
      month.cacheHitTokens, yuan(month.spentMicrounits), '', '', '']));
  }
  // 以 UTF-8 BOM 开头，Excel 才能正确识别中文。
  return `﻿${lines.join('\r\n')}\r\n`;
}
