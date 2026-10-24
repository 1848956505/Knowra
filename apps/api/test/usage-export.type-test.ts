import { usageCsv } from '../src/modules/ai/usage-export.ts';
import type { UsageCsvInput, UsageCsvRow, UsageCsvMonth } from '../src/modules/ai/usage-export.ts';
import type { usageRows } from '../src/modules/ai/budget-ledger.js';
import type { createPostgresBudgetAuthority } from '../src/modules/ai/postgres-budget-authority.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type InputShape = Assert<Equal<Parameters<typeof usageCsv>, [input: UsageCsvInput]>>;
export type OutputShape = Assert<Equal<ReturnType<typeof usageCsv>, string>>;
export type RowDisplayUnknown = Assert<Equal<UsageCsvRow['at'], unknown>>;
export type MonthDisplayUnknown = Assert<Equal<UsageCsvMonth['month'], unknown>>;
export type RowCost = Assert<Equal<UsageCsvRow['costMicrounits'], number>>;
export type MonthCost = Assert<Equal<UsageCsvMonth['spentMicrounits'], number>>;
export type Status = Assert<Equal<UsageCsvRow['status'], PropertyKey>>;
export type LedgerBoundary = Assert<ReturnType<typeof usageRows> extends UsageCsvInput ? true : false>;
export type PostgresBoundary = Assert<
  Awaited<ReturnType<ReturnType<typeof createPostgresBudgetAuthority>['usageRows']>> extends UsageCsvInput
    ? true
    : false
>;
const rows: readonly UsageCsvRow[] = [
  { status: 'settled', costMicrounits: 123_456, at: '2026-10-08T00:00:00Z', inputTokens: null, outputTokens: 2 }
];
const months: readonly UsageCsvMonth[] = [
  { month: '2026-05', requests: 2, spentMicrounits: 500_000, inputTokens: 150 }
];
const ordinary: string = usageCsv({ rows, months });
const minimal: string = usageCsv({
  rows: [{ status: 'other', costMicrounits: NaN }],
  months: [{ spentMicrounits: Infinity }]
});
const keyVariants: string = usageCsv({
  rows: [
    { status: 1, costMicrounits: 0 },
    { status: Symbol(), costMicrounits: -0 }
  ],
  months: []
});
const displayUnvalidated: string = usageCsv({
  rows: [
    {
      status: '__proto__',
      costMicrounits: -1,
      at: Symbol('allowed by String'),
      day: { toString: () => 'custom' },
      inputTokens: 3n
    }
  ],
  months: [{ spentMicrounits: 1, month: Symbol('template throws at runtime'), requests: undefined }]
});
function* rowGenerator(): Generator<UsageCsvRow, void, unknown> {
  yield { status: 'unknown', costMicrounits: 1_000_000 };
}
const lazy: string = usageCsv({ rows: rowGenerator(), months: new Set(months) });
const readonlyInput: Readonly<UsageCsvInput> = { rows, months };
usageCsv(readonlyInput);
void [ordinary, minimal, keyVariants, displayUnvalidated, lazy];

import { usageCsv as bridgeUsageCsv } from '../src/modules/ai/usage-export.js';
export type BridgeIdentity = Assert<Equal<typeof bridgeUsageCsv, typeof usageCsv>>;
export type RowIterable = Assert<Equal<UsageCsvInput['rows'], Iterable<UsageCsvRow, unknown, unknown>>>;
export type MonthIterable = Assert<Equal<UsageCsvInput['months'], Iterable<UsageCsvMonth, unknown, unknown>>>;
export type RowDay = Assert<Equal<UsageCsvRow['day'], unknown>>;
export type RowModelId = Assert<Equal<UsageCsvRow['modelId'], unknown>>;
export type RowInputTokens = Assert<Equal<UsageCsvRow['inputTokens'], unknown>>;
export type RowOutputTokens = Assert<Equal<UsageCsvRow['outputTokens'], unknown>>;
export type RowCacheHitTokens = Assert<Equal<UsageCsvRow['cacheHitTokens'], unknown>>;
export type RowConversationId = Assert<Equal<UsageCsvRow['conversationId'], unknown>>;
export type RowPriceVersion = Assert<Equal<UsageCsvRow['priceVersion'], unknown>>;
export type RowAttemptId = Assert<Equal<UsageCsvRow['attemptId'], unknown>>;
export type MonthRequests = Assert<Equal<UsageCsvMonth['requests'], unknown>>;
export type MonthInputTokens = Assert<Equal<UsageCsvMonth['inputTokens'], unknown>>;
export type MonthOutputTokens = Assert<Equal<UsageCsvMonth['outputTokens'], unknown>>;
export type MonthCacheHitTokens = Assert<Equal<UsageCsvMonth['cacheHitTokens'], unknown>>;
declare const ledgerResult: ReturnType<typeof usageRows>;
usageCsv(ledgerResult);
declare const postgresResult: Awaited<ReturnType<ReturnType<typeof createPostgresBudgetAuthority>['usageRows']>>;
usageCsv(postgresResult);
