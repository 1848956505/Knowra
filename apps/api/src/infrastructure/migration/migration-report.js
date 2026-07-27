export function createMigrationReport({
  sourceFile,
  storageRootDir,
  generatedAt = new Date().toISOString()
} = {}) {
  const report = {
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
    count(collection, value) { report.counts[collection] = value; },
    repair(code, message, details = {}) {
      report.repairs.push({ code, message, ...details });
    },
    warn(code, message, details = {}) {
      report.warnings.push({ code, message, ...details });
    },
    error(code, message, details = {}) {
      report.errors.push({ code, message, ...details });
      report.status = 'blocked';
    },
    finish(status = report.errors.length ? 'blocked' : 'ready') {
      report.status = status;
      return report;
    }
  };
}
