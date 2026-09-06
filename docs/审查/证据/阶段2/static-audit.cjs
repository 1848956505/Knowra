// Read-only repository inspection. Writes evidence only beside this script.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const parser = require(path.join(root, 'node_modules/@babel/parser'));
const out = __dirname;
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(p => p && !p.startsWith('docs/审查/证据/阶段2/')))].sort();
const isTest = p => /(?:^|\/)(?:test|tests|e2e)(?:\/|$)|\.(?:test|spec)\.[^/]+$/.test(p);
function unit(p) {
  if (p.startsWith('docs/')) return /\.(?:html|png|jpe?g|svg|woff2?|pages)$/.test(p) ? 'C-18' : 'C-17';
  if (/^(AGENTS|CLAUDE|README)\.md$/.test(p)) return 'C-17';
  if (isTest(p)) return 'C-14';
  if (/^(deploy|\.github)\//.test(p)) return 'C-16';
  if (p.startsWith('scripts/')) return 'C-15';
  if (p.startsWith('prisma/')) return 'C-11';
  if (p.startsWith('packages/')) return 'C-07';
  if (p.startsWith('apps/web/')) return 'C-13';
  if (p.startsWith('apps/web-v4/')) {
    if (/\/src\/(app|shell|store|views)\/|\/src\/main\.tsx$/.test(p)) return 'C-02';
    if (/\/src\/(components|styles)\//.test(p)) return 'C-03';
    if (/\/src\/(features\/editor|browser)\//.test(p)) return 'C-04';
    if (p.includes('/features/notes/')) return 'C-05';
    if (p.includes('/features/tags/')) return 'C-06';
    return 'C-15';
  }
  if (p.startsWith('apps/api/')) {
    if (/attachment|snapshot|maintenance-gate|\/migration\//.test(p)) return 'C-12';
    if (/postgres|prisma-client/.test(p)) return 'C-11';
    if (/\/infrastructure\//.test(p)) return 'C-10';
    if (/\/modules\/knowledge\//.test(p) && !p.includes('/http/')) return 'C-09';
    return 'C-08';
  }
  return p.includes('/') ? 'UNASSIGNED' : 'C-01';
}
function category(p) {
  if (/\.(?:png|jpe?g|svg|woff2?|ico|gif|pages)$/.test(p)) return 'asset';
  if (p.startsWith('docs/')) return /\.(?:html|[cm]?[jt]sx?|css)$/.test(p) ? 'prototype' : 'documentation';
  if (/\.md$/.test(p)) return 'documentation';
  if (isTest(p)) return 'test';
  if (/\.(?:json|toml|ya?ml)$|config\.|\.d\.ts$/.test(p)) return 'configuration';
  if (/\.(?:[cm]?[jt]sx?|css|sh|ps1|sql|prisma)$/.test(p)) return p.startsWith('apps/web/') ? 'legacy-source' : 'source';
  return 'other';
}
const inventory = files.map(p => {
  const full = path.join(root, p);
  if (!fs.existsSync(full)) return { path: p, unit: unit(p), category: category(p), missing: true };
  const stat = fs.lstatSync(full);
  const excluded = /^(storage|node_modules)\/|(^|\/)\.env(?:$|\.)|\.(pem|key|p12)$/.test(p);
  const data = stat.isFile() && !excluded ? fs.readFileSync(full) : null;
  return { path: p, unit: unit(p), category: category(p), bytes: stat.size,
    sha256: data ? hash(data) : null,
    lines: data && /\.(?:[cm]?[jt]sx?|css|md|sh|ps1|prisma|sql)$/.test(p) ? data.toString().split('\n').length - (data.at(-1) === 10 ? 1 : 0) : null };
});
const b1 = JSON.parse(fs.readFileSync(path.join(root, 'docs/审查/证据/阶段1/文件指纹.json')));
const current = new Map(inventory.map(x => [x.path, x]));
const old = new Set(b1.files.map(x => x.path));
const delta = {
  changed: b1.files.filter(x => x.sha256 && current.get(x.path)?.sha256 !== x.sha256).map(x => x.path),
  deleted: b1.files.filter(x => !current.has(x.path)).map(x => x.path),
  added: inventory.filter(x => !old.has(x.path)).map(x => x.path)
};
const sources = inventory.filter(x => !x.path.startsWith('docs/') && /\.[cm]?[jt]sx?$/.test(x.path) && !x.missing);
const sourcePaths = new Set(sources.map(x => x.path));
const edges = [], parseErrors = [], nonLiteralImports = [];
const packages = ['apps/api', 'apps/web', 'apps/web-v4', 'packages/web-core', 'packages/shared'].map(p => ({ dir: p, ...JSON.parse(fs.readFileSync(path.join(root, p, 'package.json'))) }));
function resolve(from, spec) {
  let base;
  if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else {
    const pkg = packages.find(p => p.name === spec);
    if (!pkg) return null;
    base = pkg.dir + '/src/index';
  }
  const candidates = [base, ...['.ts', '.tsx', '.js', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'].map(e => base + e)];
  if (/\.[cm]?jsx?$/.test(base)) candidates.push(base.replace(/\.[cm]?jsx?$/, '.ts'), base.replace(/\.[cm]?jsx?$/, '.tsx'));
  return candidates.find(p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile()) ?? null;
}
for (const file of sources) {
  const text = fs.readFileSync(path.join(root, file.path), 'utf8');
  let ast;
  try {
    ast = parser.parse(text, { sourceType: 'unambiguous', plugins: [['typescript', { dts: file.path.endsWith('.d.ts') }], 'jsx'], errorRecovery: true, createImportExpressions: true });
  } catch (error) {
    parseErrors.push({ path: file.path, line: error.loc?.line, message: error.message });
    continue;
  }
  for (const error of ast.errors ?? []) parseErrors.push({ path: file.path, line: error.loc?.line, message: error.message });
  function add(node, spec, kind, typeOnly = false) {
    const target = resolve(file.path, spec);
    edges.push({ from: file.path, line: node.loc?.start.line, specifier: spec, target, kind, typeOnly, relativeUnresolved: spec.startsWith('.') && !target });
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source?.type === 'StringLiteral') {
      const typeOnly = node.importKind === 'type' || node.exportKind === 'type' ||
        (!!node.specifiers?.length && node.specifiers.every(s => s.importKind === 'type' || s.exportKind === 'type'));
      add(node, node.source.value, node.type === 'ImportDeclaration' ? 'import' : 'export', typeOnly);
    } else if (node.type === 'ImportExpression') {
      if (node.source.type === 'StringLiteral') add(node, node.source.value, 'dynamic');
      else nonLiteralImports.push({ path: file.path, line: node.loc?.start.line });
    } else if (node.type === 'CallExpression' && (node.callee.type === 'Import' || (node.callee.type === 'Identifier' && node.callee.name === 'require'))) {
      const arg = node.arguments[0];
      if (arg?.type === 'StringLiteral') add(node, arg.value, 'dynamic');
      else nonLiteralImports.push({ path: file.path, line: node.loc?.start.line });
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'comments', 'tokens', 'errors'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  }
  visit(ast);
}
function cycles(includeTypes) {
  const graph = new Map(sources.filter(f => !isTest(f.path)).map(f => [f.path, []]));
  for (const e of edges) if (graph.has(e.from) && graph.has(e.target) && (includeTypes || !e.typeOnly)) graph.get(e.from).push(e.target);
  let next = 0; const indices = new Map(), low = new Map(), stack = [], active = new Set(), result = [];
  function visit(v) {
    indices.set(v, next); low.set(v, next++); stack.push(v); active.add(v);
    for (const w of graph.get(v)) {
      if (!indices.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (active.has(w)) low.set(v, Math.min(low.get(v), indices.get(w)));
    }
    if (low.get(v) === indices.get(v)) {
      const group = []; let w;
      do { w = stack.pop(); active.delete(w); group.push(w); } while (w !== v);
      if (group.length > 1 || graph.get(v).includes(v)) result.push(group.sort());
    }
  }
  for (const v of graph.keys()) if (!indices.has(v)) visit(v);
  return result;
}
const hashGroups = new Map();
for (const f of sources.filter(f => !isTest(f.path) && f.bytes > 100)) {
  const group = hashGroups.get(f.sha256) ?? []; group.push(f.path); hashGroups.set(f.sha256, group);
}
const duplicates = [...hashGroups.values()].filter(g => g.length > 1);
const violations = edges.filter(e => !isTest(e.from) && (
  (e.from.startsWith('apps/web-v4/') && (e.target?.startsWith('apps/web/') || e.specifier === '@study-accelerator/web')) ||
  (e.specifier.startsWith('react-aria-components') && e.from.startsWith('apps/web-v4/src/') && !e.from.startsWith('apps/web-v4/src/components/ui/')) ||
  (e.from.startsWith('packages/web-core/src/') && (e.target?.startsWith('apps/') || /^(react(?:-dom)?(?:\/|$)|react-aria-components)/.test(e.specifier) || /\.css($|\?)/.test(e.specifier)))
));
const layerCandidates = edges.filter(e => !isTest(e.from) && e.target && (
  (e.from.includes('/domain/') && /\/(application|http|infrastructure)\//.test(e.target)) ||
  (e.from.includes('/modules/knowledge/infrastructure/') && /\/(application|http)\//.test(e.target)) ||
  (e.from.includes('/modules/knowledge/application/') && e.target.includes('/http/')) ||
  (e.from.startsWith('apps/web-v4/src/components/ui/') && /\/(features|store|app)\//.test(e.target))
));
const docLinks = [];
for (const f of inventory.filter(f => f.path.endsWith('.md') && !f.path.startsWith('docs/审查/证据/'))) {
  const text = fs.readFileSync(path.join(root, f.path), 'utf8').replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '');
  for (const m of text.matchAll(/\[[^\]\n]+\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const raw = m[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z]+:|#|\/)/i.test(raw)) continue;
    let ref; try { ref = decodeURIComponent(raw.split('#')[0]); } catch { continue; }
    if (!ref) continue;
    const target = path.resolve(root, path.dirname(f.path), ref);
    if (!fs.existsSync(target)) docLinks.push({ from: f.path, target: ref, archived: f.path.startsWith('docs/已归档/'), line: fs.readFileSync(path.join(root, f.path), 'utf8').split('\n').findIndex(l => l.includes(m[0])) + 1 });
  }
}
const counts = key => inventory.reduce((a, f) => (a[f[key]] = (a[f[key]] ?? 0) + 1, a), {});
const summary = { capturedAt: new Date().toISOString(), root, branch: git('branch', '--show-current'), commit: git('rev-parse', 'HEAD'), node: process.version,
  parser: '@babel/parser ' + require(path.join(root, 'node_modules/@babel/parser/package.json')).version, inventory: inventory.length, unitCounts: counts('unit'), categoryCounts: counts('category'), deltaFromB1: delta,
  parsedFiles: sources.length, importEdges: edges.length, parseErrors, boundaryViolations: violations,
  relativeUnresolved: edges.filter(e => e.relativeUnresolved), nonLiteralImports,
  runtimeCycles: cycles(false), cyclesIncludingTypes: cycles(true), exactDuplicateGroups: duplicates,
  layerCandidates, over250: sources.filter(f => !isTest(f.path) && f.lines > 250).sort((a,b) => b.lines-a.lines),
  brokenDocLinkCandidates: docLinks.length,
  limitations: ['静态字面量依赖图不是完整执行图；type-only 与运行时边分开。', '工作区包名映射 src/index 用于源码关系分析，不代替 package exports 或构建验证。', '重复组仅比较 >100 字节非测试 JS/TS 的完全相同内容；不证明业务语义重复。', 'Markdown 链接是去代码围栏的启发式扫描，不覆盖引用式链接、锚点和 HTML；结果需人工复核。', '不枚举忽略目录，不读取运行数据或凭据；不运行应用或测试。'] };
write('文件覆盖.json', inventory); write('静态依赖.json', edges); write('文档链接候选.json', docLinks); write('静态扫描.json', summary);
const boundary = cp.spawnSync(process.execPath, ['scripts/check-v4-boundaries.mjs'], { cwd: root, encoding: 'utf8' });
write('架构门禁.json', { command: 'node scripts/check-v4-boundaries.mjs', timestamp: new Date().toISOString(), exitCode: boundary.status, stdout: boundary.stdout, stderr: boundary.stderr });
console.log(JSON.stringify({ ...summary, over250: summary.over250.slice(0,25), relativeUnresolved: summary.relativeUnresolved.slice(0,20), deltaFromB1: { changed: delta.changed, deleted: delta.deleted, addedCount: delta.added.length } }, null, 2));
