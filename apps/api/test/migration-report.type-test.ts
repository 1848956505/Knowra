import { createMigrationReport } from '../src/infrastructure/migration/migration-report.ts';
import { createMigrationReport as bridgeCreateMigrationReport } from '../src/infrastructure/migration/migration-report.js';
import type {
  MigrationReport,
  MigrationReportTools,
  MigrationReportEntry,
  MigrationReportOptions
} from '../src/infrastructure/migration/migration-report.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type FactoryResult = Assert<Equal<ReturnType<typeof createMigrationReport>, MigrationReportTools>>;
export type FactoryInput = Assert<
  Equal<Parameters<typeof createMigrationReport>, [options?: MigrationReportOptions | undefined]>
>;
export type BridgeShape = Assert<Equal<typeof bridgeCreateMigrationReport, typeof createMigrationReport>>;
export type OptionSource = Assert<Equal<MigrationReportOptions['sourceFile'], unknown>>;
export type OptionRoot = Assert<Equal<MigrationReportOptions['storageRootDir'], unknown>>;
export type OptionTime = Assert<Equal<MigrationReportOptions['generatedAt'], unknown>>;
export type Source = Assert<Equal<MigrationReport['sourceFile'], unknown>>;
export type Root = Assert<Equal<MigrationReport['storageRootDir'], unknown>>;
export type Time = Assert<Equal<MigrationReport['generatedAt'], unknown>>;
export type Phase = Assert<Equal<MigrationReport['phase'], string>>;
export type Migration = Assert<Equal<MigrationReport['migration'], string>>;
export type Status = Assert<Equal<MigrationReport['status'], unknown>>;
export type Checksum = Assert<Equal<MigrationReport['checksum'], unknown>>;
export type Counts = Assert<Equal<MigrationReport['counts'], Record<PropertyKey, unknown>>>;
export type Repairs = Assert<Equal<MigrationReport['repairs'], MigrationReportEntry[]>>;
export type Warnings = Assert<Equal<MigrationReport['warnings'], MigrationReportEntry[]>>;
export type Errors = Assert<Equal<MigrationReport['errors'], MigrationReportEntry[]>>;
export type Attachments = Assert<Equal<MigrationReport['attachmentFiles'], unknown[]>>;
export type EntryCode = Assert<Equal<MigrationReportEntry['code'], unknown>>;
export type EntryMessage = Assert<Equal<MigrationReportEntry['message'], unknown>>;
export type EntryKeys = Assert<Equal<keyof MigrationReportEntry, PropertyKey>>;
export type ReportKeys = Assert<
  Equal<
    keyof MigrationReport,
    | 'phase'
    | 'migration'
    | 'generatedAt'
    | 'sourceFile'
    | 'storageRootDir'
    | 'status'
    | 'counts'
    | 'repairs'
    | 'warnings'
    | 'errors'
    | 'attachmentFiles'
    | 'checksum'
  >
>;
export type CountArguments = Assert<
  Equal<Parameters<MigrationReportTools['count']>, [collection: PropertyKey, value: unknown]>
>;
export type RepairArguments = Assert<
  Equal<
    Parameters<MigrationReportTools['repair']>,
    [code: unknown, message: unknown, details?: object | null | undefined]
  >
>;
export type WarnArguments = Assert<
  Equal<
    Parameters<MigrationReportTools['warn']>,
    [code: unknown, message: unknown, details?: object | null | undefined]
  >
>;
export type ErrorArguments = Assert<
  Equal<
    Parameters<MigrationReportTools['error']>,
    [code: unknown, message: unknown, details?: object | null | undefined]
  >
>;
export type FinishArguments = Assert<Equal<Parameters<MigrationReportTools['finish']>, [status?: unknown]>>;
export type FinishResult = Assert<Equal<ReturnType<MigrationReportTools['finish']>, MigrationReport>>;
export type CountResult = Assert<Equal<ReturnType<MigrationReportTools['count']>, void>>;
export type RepairResult = Assert<Equal<ReturnType<MigrationReportTools['repair']>, void>>;
export type WarnResult = Assert<Equal<ReturnType<MigrationReportTools['warn']>, void>>;
export type ErrorResult = Assert<Equal<ReturnType<MigrationReportTools['error']>, void>>;

const tools = createMigrationReport();
createMigrationReport(undefined);
createMigrationReport({ sourceFile: null, storageRootDir: '/tmp/synthetic', generatedAt: 'fixed' });
createMigrationReport({ sourceFile: Symbol('source'), storageRootDir: 2n, generatedAt: false });
const readonlyOptions: Readonly<MigrationReportOptions> = { sourceFile: 'input', generatedAt: undefined };
bridgeCreateMigrationReport(readonlyOptions);
tools.count('notes', 2);
tools.count(0, { raw: true });
tools.count(Symbol('key'), undefined);
tools.repair('code', 'message');
tools.warn('code', 'message', null);
tools.error(undefined, Symbol('message'), { code: undefined, message: null });
tools.repair('code', 'message', Object.freeze({ extra: 1 }));
tools.repair(
  'code',
  'message',
  Object.assign(() => undefined, { code: Symbol('override') })
);
tools.repair('code', 'message', [1, 2]);
tools.warn('code', 'message', undefined);
const report: MigrationReport = tools.finish({ raw: 'status' });
tools.finish(null);
tools.finish(undefined);
tools.finish(false);
tools.finish(0);
tools.finish('');
tools.finish();
report.phase = 'externally changed';
report.migration = 'externally changed';
report.sourceFile = { raw: true };
report.storageRootDir = null;
report.generatedAt = Symbol('time');
report.status = Symbol('status');
report.checksum = 'actual checksum';
report.attachmentFiles.push({ attachmentId: 'a', exists: true });
report.attachmentFiles.push(undefined);
report.repairs.push({ code: undefined, message: undefined, nested: { raw: true } });
report.warnings = [{ code: null, message: Symbol('message'), [Symbol('extra')]: null }];
report.errors = [];
report.counts = { [Symbol('count')]: null };

// 结构合同允许改写容器方法，不证明追加副作用或报告状态不变量。
report.errors.push = () => {
  report.status = { externallyChanged: true };
  return 7;
};
tools.error('code', 'message');
// 替换公开属性合法，不意味着闭包中的原始 report 随之替换。
tools.report = createMigrationReport().report;
const finished: MigrationReport = tools.finish();
void [report, finished];
