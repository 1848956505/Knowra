export interface MigrationReportOptions {
  readonly sourceFile?: unknown;
  readonly storageRootDir?: unknown;
  readonly generatedAt?: unknown;
}
export interface MigrationReportEntry {
  [key: PropertyKey]: unknown;
  code: unknown;
  message: unknown;
}
export interface MigrationReport {
  phase: string;
  migration: string;
  generatedAt: unknown;
  sourceFile: unknown;
  storageRootDir: unknown;
  status: unknown;
  counts: Record<PropertyKey, unknown>;
  repairs: MigrationReportEntry[];
  warnings: MigrationReportEntry[];
  errors: MigrationReportEntry[];
  attachmentFiles: unknown[];
  checksum: unknown;
}
export interface MigrationReportTools {
  report: MigrationReport;
  count(collection: PropertyKey, value: unknown): void;
  repair(code: unknown, message: unknown, details?: object | null | undefined): void;
  warn(code: unknown, message: unknown, details?: object | null | undefined): void;
  error(code: unknown, message: unknown, details?: object | null | undefined): void;
  finish(status?: unknown): MigrationReport;
}

export function createMigrationReport({
  sourceFile,
  storageRootDir,
  generatedAt = new Date().toISOString()
}: MigrationReportOptions = {}): MigrationReportTools {
  const report: MigrationReport = {
    phase: 'Phase1.0',
    migration: 'json-to-postgres',
    generatedAt,
    sourceFile: sourceFile ?? null,
    storageRootDir: storageRootDir ?? null,
    status: 'ready',
    counts: {},
    repairs: [],
    warnings: [],
    errors: [],
    attachmentFiles: [],
    checksum: null
  };

  return {
    report,
    count(collection: PropertyKey, value: unknown) {
      report.counts[collection] = value;
    },
    repair(code: unknown, message: unknown, details: object | null | undefined = {}) {
      report.repairs.push({ code, message, ...details });
    },
    warn(code: unknown, message: unknown, details: object | null | undefined = {}) {
      report.warnings.push({ code, message, ...details });
    },
    error(code: unknown, message: unknown, details: object | null | undefined = {}) {
      report.errors.push({ code, message, ...details });
      report.status = 'blocked';
    },
    finish(status: unknown = report.errors.length ? 'blocked' : 'ready') {
      report.status = status;
      return report;
    }
  };
}
