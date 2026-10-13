// 固定重构前版本；只保存输入与结果，不能从当前实现重建「旧行为」。
export const BASELINE_COMMIT = '5e80f09c45edd8112b9f3cdd7345bf1cfb345277';

// 保留 undefined、Map 与非有限数字，避免 JSON 悄悄改变返回值形状。
export function encodeCompatibilityValue(value) {
  if (value === undefined) return { $type: 'undefined' };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $type: String(value) };
  if (value instanceof Map) return { $type: 'Map', entries: [...value].map(encodeCompatibilityValue) };
  if (Array.isArray(value)) return value.map(encodeCompatibilityValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeCompatibilityValue(item)]));
  }
  return value;
}

export function publicCompatibilityCases(api) {
  const cases = {};
  const record = (name, run) => {
    try { cases[name] = { returned: encodeCompatibilityValue(run()) }; }
    catch (error) {
      cases[name] = { threw: encodeCompatibilityValue({ name: error.name, message: error.message, code: error.code }) };
    }
  };
  const select = (markdown, quote) => {
    const projection = api.projectMarkdown(markdown), start = projection.text.indexOf(quote);
    return api.anchorFromProjectedRange(projection, start, start + quote.length);
  };
  const follow = (before, after, anchor, edits = [api.sourceEdit(before, after)]) =>
    api.followAnchorChanges(before, after, anchor, edits);

  record('constants-and-hashes', () => ({
    projectionVersion: api.MARKDOWN_PROJECTION_VERSION,
    identityFormat: api.IDENTITY_SHADOW_FORMAT,
    editorTypes: api.EDITOR_TO_MARKDOWN_BLOCK,
    editorTypesFrozen: Object.isFrozen(api.EDITOR_TO_MARKDOWN_BLOCK),
    hashes: [undefined, null, '', 'abc', '中文😀\r\n', 'x'.repeat(56), 'x'.repeat(64), 42].map(api.calculateContentHash),
    quoteHashes: [null, undefined, '甲 乙\n丙\uFFFC', '甲乙丙', '甲丙'].map(api.identityQuoteHash)
  }));

  // 沿用 projection/list/dynamic 测试的格式组合，同时冻结 UTF-16、CRLF、转义与原子偏移。
  const complex = '# 标题\r\n\r\n中😀 **重点** &amp; \\*转义\\* [链接](https://example.test) ![图](asset:x)\r\n\r\n- 父 `code`\r\n  - 子\r\n\r\n> 引用\r\n\r\n```js\r\na()\r\n```\r\n\r\n| A | B |\r\n| - | - |\r\n| 值 | $x$ |\r\n\r\n## 尾\r\n<br />';
  record('projection-complex-offsets', () => api.projectMarkdown(complex));
  record('projection-coercion', () => [null, undefined, 42, ''].map(api.projectMarkdown));
  const projection = api.projectMarkdown(complex);
  record('anchor-create-ranges-blocks-section', () => ({
    selection: select(complex, '重点'),
    source: api.anchorForSourceRange(projection, complex.indexOf('重点'), complex.indexOf('重点') + 2),
    block: api.anchorForBlock(projection, 1),
    section: api.anchorForSection(projection, 0),
    headingPaths: [0, complex.indexOf('重点'), complex.indexOf('尾'), complex.length].map(offset => api.headingPathForSourceOffset(projection, offset))
  }));
  const short = '前重要文字后', selection = select(short, '重要文字');
  record('anchor-resolve-exact', () => api.resolveAnchor(short, selection));
  record('anchor-resolve-content-changed', () => api.resolveAnchor('前重要内容后', selection));
  record('anchor-resolve-version-mismatch', () => api.resolveAnchor(short, { ...selection, projectionVersion: 99 }));
  record('anchor-resolve-deleted', () => api.resolveAnchor('', selection));
  record('anchor-relocate-unique', () => api.relocateAnchor('重要文字后', selection));
  record('anchor-relocate-ambiguous', () => api.relocateAnchor('xx重要文字yy重要文字', { ...selection, prefixText: '', suffixText: '' }));
  record('anchor-relocate-missing', () => api.relocateAnchor('', selection));
  const sectionSource = '## A\n\n正文\n\n## B\n\n尾', section = api.anchorForSection(api.projectMarkdown(sectionSource), 0);
  record('section-follow-body', () => api.followSectionAnchor(sectionSource.replace('正文', '正文\n\n新增'), section));
  record('section-follow-boundary', () => api.followSectionAnchor(sectionSource.replace('## B', '# B'), section));
  record('section-follow-missing-identity', () => api.followSectionAnchor(sectionSource, selection));
  record('section-follow-deleted', () => api.followSectionAnchor('', section));

  const after = '前新增重要文字后\n';
  const mapping = {
    formatVersion: 1, operationId: 'compatibility-operation',
    baseContentHash: api.calculateContentHash(short), targetContentHash: api.calculateContentHash(after),
    edits: api.sourceEdits(short, after)
  };
  record('source-edit-replay-and-verification', () => ({
    edit: api.sourceEdit(short, after), edits: mapping.edits,
    replayed: mapping.edits.reduce(api.applySourceEdit, short),
    noChange: api.sourceEdit(short, short), noChanges: api.sourceEdits(short, short),
    verified: api.verifiedSourceEdits(short, after, mapping),
    absent: api.verifiedSourceEdits(short, after),
    forged: api.verifiedSourceEdits(short, 'forged', mapping),
    wrongVersion: api.verifiedSourceEdits(short, after, { ...mapping, formatVersion: 2 }),
    malformed: api.verifiedSourceEdits(short, after, { ...mapping, edits: [{ from: -1, to: 0, text: '' }] })
  }));
  record('source-edits-multiple-unicode', () => api.sourceEdits('甲😀\n\n中段\n\n尾', '首甲😀\n\n中段新\n\n尾\n'));
  record('dynamic-selection-rewrite', () => follow(short, '前新结论后', selection));
  record('dynamic-selection-deletion', () => follow(short, '前后', selection));
  record('dynamic-selection-no-revival', () => follow(short, short, selection, [api.sourceEdit(short, '前后'), api.sourceEdit('前后', short)]));
  record('dynamic-selection-history', () => follow(short, short, selection, [api.sourceEdit(short, '前后'), { ...api.sourceEdit('前后', short), history: true }]));
  record('dynamic-section-boundary', () => follow(sectionSource, sectionSource.replace('## A', '### A'), section));
  const blockSource = '首段\n\n重要文字\n\n尾段', block = api.anchorForBlock(api.projectMarkdown(blockSource), 1);
  record('dynamic-block-split', () => follow(blockSource, blockSource.replace('重要文字', '重要\n\n文字'), block));
  record('dynamic-block-merge', () => follow(blockSource, blockSource.replace('重要文字\n\n尾段', '重要文字尾段'), block));
  const whole = api.anchorForBlock(api.projectMarkdown('重要内容'), 0);
  record('dynamic-empty-block-and-retype', () => {
    const cleared = follow('重要内容', '', whole, [{ ...api.sourceEdit('重要内容', ''), preserveEmptyBlock: true }]);
    return { cleared, resolved: api.resolveAnchor('', cleared.anchor), retyped: follow('', '新内容', cleared.anchor) };
  });
  record('dynamic-block-cut-and-paste', () => {
    const before = '重点\n\n其他', cut = '其他', after = '其他\n\n重点';
    const anchor = api.anchorForBlock(api.projectMarkdown(before), 0);
    const edits = [{ ...api.sourceEdit(before, cut), moveId: 'once', moveKind: 'cut' }, { ...api.sourceEdit(cut, after), moveId: 'once', moveKind: 'paste' }];
    return follow(before, after, anchor, edits);
  });
  record('structure-identities-revisions-and-copy', () => {
    const initial = api.updateStructure('', '# A\n\n内容');
    const inserted = api.updateStructure('# A\n\n内容', '前言\n\n# A\n\n内容', initial);
    const copied = api.updateStructure('# A\n\n内容', '# A\n\n内容\n\n# A\n\n内容', initial);
    return { initial, inserted, copied };
  });

  const listSource = '- 父项\n  - 子项\n- 相邻';
  const listProjection = api.projectMarkdown(listSource), listStructure = api.updateStructure('', listSource);
  const listAnchor = api.anchorForListItem(listProjection, '0.0');
  listAnchor.tracking = api.listTracking(listProjection, listAnchor, listStructure);
  record('list-anchor-and-tracking', () => ({
    anchor: listAnchor,
    noStructure: api.listTracking(listProjection, listAnchor),
    childTracking: api.listTracking(listProjection, api.anchorForListItem(listProjection, '0.0.1.0'), listStructure)
  }));
  record('list-resolve-and-follow', () => ({ resolve: api.resolveAnchor(listSource, listAnchor), follow: api.followListAnchor(listSource, listAnchor) }));
  record('list-stale-range-and-version', () => ({
    stale: api.followListAnchor(listSource, { ...listAnchor, sourceEnd: listSource.length }),
    version: api.resolveAnchor(listSource, { ...listAnchor, projectionVersion: 99 })
  }));
  const followList = after => api.followListAnchorChanges(listSource, after, listAnchor, api.sourceEdits(listSource, after), { before: listStructure });
  record('list-follow-new-child', () => followList(listSource.replace('子项', '子项\n  - 新项')));
  record('list-follow-boundary', () => followList('- 父项\n- 子项\n- 相邻'));
  record('list-follow-deleted', () => followList('- 相邻'));
  record('list-empty-and-retype', () => {
    const before = '- 父', blank = '- ', after = '- 新';
    const p = api.projectMarkdown(before), structure = api.updateStructure('', before), anchor = api.anchorForListItem(p, '0.0');
    anchor.tracking = api.listTracking(p, anchor, structure);
    const emptied = api.followListAnchorChanges(before, blank, anchor, api.sourceEdits(before, blank), { before: structure });
    const nextStructure = api.updateStructure(before, blank, structure, api.sourceEdits(before, blank));
    return { empty: api.anchorForListItem(api.projectMarkdown(blank), '0.0', true), emptied,
      retyped: api.followListAnchorChanges(blank, after, emptied.anchor, api.sourceEdits(blank, after), { before: nextStructure }) };
  });

  const identityMarkdown = '# 标题\n\n重点\n\n<br />\n\n- 甲\n  - 乙\n\n$$\nx^2\n$$\n\n| A |\n| - |\n| 值 |';
  const identityBlocks = api.parseIdentityBlocks(identityMarkdown);
  const editorBlocks = identityBlocks.map((block, index) => ({ id: `b${index}`, type: block.br ? 'paragraph' : block.type, empty: block.br }));
  editorBlocks.push({ id: 'trailing', type: 'paragraph', empty: true });
  const editorState = { formatVersion: 2, targetContentHash: api.calculateContentHash(identityMarkdown), blocks: editorBlocks, annotations: [] };
  record('identity-block-types-offsets-map', () => ({ blocks: identityBlocks, alignment: api.alignIdentityBlocks(identityBlocks, editorBlocks) }));
  record('identity-validation', () => [
    editorState, null, {}, { ...editorState, formatVersion: 1 },
    { ...editorState, blocks: [{ id: 'x', type: 'code_block', empty: false }] },
    { ...editorState, blocks: [{ id: 'x'.repeat(129), type: 'paragraph', empty: false }] },
    { ...editorState, annotations: [{ id: 'a', scopeType: 'other', present: true }] },
    { ...editorState, annotations: [{ id: 'a', scopeType: 'selection', present: true, quoteHash: 'x'.repeat(129) }] }
  ].map(api.validIdentityEditorState));
  record('identity-compare-guard-results', () => ({
    valid: api.compareIdentityShadow({ markdown: identityMarkdown, editorState, annotations: [] }),
    invalid: api.compareIdentityShadow({ markdown: identityMarkdown, editorState: null, annotations: [] }),
    mismatch: api.compareIdentityShadow({ markdown: identityMarkdown + 'x', editorState, annotations: [] }),
    alignment: api.compareIdentityShadow({ markdown: identityMarkdown, editorState: { ...editorState, blocks: [{ id: 'x', type: 'code', empty: false }] }, annotations: [] })
  }));
  record('identity-compare-all-scopes', () => {
    const start = identityMarkdown.indexOf('重点'), listStart = identityMarkdown.indexOf('甲');
    const tracked = [
      { id: 'selection', scopeType: 'selection', present: true, startBlockId: 'b1', endBlockId: 'b1', quoteHash: api.identityQuoteHash('重点') },
      { id: 'blocks', scopeType: 'blocks', present: true, startBlockId: 'b1', endBlockId: 'b1' },
      { id: 'section', scopeType: 'section', present: true, rootBlockId: 'b0' },
      { id: 'list', scopeType: 'list', present: true, rootBlockId: 'b3' }
    ];
    const annotations = tracked.map(item => ({ id: item.id, scopeType: item.scopeType, anchorStatus: 'resolved', quoteText: '重点',
      anchor: item.scopeType === 'section' ? { sourceStart: 2, sourceEnd: identityMarkdown.length }
        : item.scopeType === 'list' ? { sourceStart: listStart, sourceEnd: identityMarkdown.indexOf('乙') + 1 }
          : { sourceStart: start, sourceEnd: start + 2 } }));
    return api.compareIdentityShadow({ markdown: identityMarkdown, annotations, editorState: { ...editorState, annotations: tracked } });
  });
  record('identity-compare-all-divergences', () => {
    const start = identityMarkdown.indexOf('重点');
    const resolved = id => ({ id, scopeType: 'selection', anchorStatus: 'resolved', anchor: { sourceStart: start, sourceEnd: start + 2 }, quoteText: '重点' });
    const present = (id, extra = {}) => ({ id, scopeType: 'selection', present: true, startBlockId: 'b1', endBlockId: 'b1', quoteHash: api.identityQuoteHash('重点'), ...extra });
    const annotations = [resolved('same'), { ...resolved('lost'), anchorStatus: 'missing', anchorReason: 'sourceDeleted' }, resolved('gone'),
      resolved('block'), resolved('quote'), { ...resolved('review'), anchorStatus: 'needsReview', anchorReason: 'boundaryChanged' },
      { ...resolved('archived'), lifecycleStatus: 'deleted' }];
    return api.compareIdentityShadow({ markdown: identityMarkdown, annotations, editorState: { ...editorState, annotations: [
      present('same'), present('lost'), present('gone', { present: false }), present('block', { startBlockId: 'b0' }),
      present('quote', { quoteHash: api.identityQuoteHash('不同') }), present('review'), present('archived'), present('unknown')
    ] } });
  });

  const url = api.createNoteLinkUrl('目标/笔记', 'occ-first'), locator = api.parseNoteLinkUrl(url);
  const links = `[**甲**](${url}) [乙][ref]\n\n[ref]: ${api.createNoteLinkUrl('目标/笔记', 'occ-second')}\n\n[[legacy-id]]\n\n\`[代码](${url})\``;
  record('note-link-format-extraction-resolution', () => ({
    url, locator, extracted: api.extractNoteLinks(links), resolved: api.resolveNoteLinkOccurrence(links, locator),
    duplicate: api.resolveNoteLinkOccurrence(`[甲](${url}) [甲](${url})`, locator),
    invalid: [null, 42, 'https://example.test', 'knowra://note/%0A#ref=occ-first', 'knowra://note/%E0%A4#ref=occ-first'].map(api.parseNoteLinkUrl)
  }));

  for (const [name, run] of Object.entries({
    'projected-range-negative': () => api.anchorFromProjectedRange(projection, -1, 1),
    'projected-range-empty': () => api.anchorFromProjectedRange(projection, 1, 1),
    'projection-version': () => api.anchorFromProjectedRange({ ...projection, version: 99 }, 0, 1),
    'source-range-invalid': () => api.anchorForSourceRange(projection, -1, 1),
    'block-missing': () => api.anchorForBlock(projection, -1),
    'section-missing': () => api.anchorForSection(projection, 99),
    'anchor-null': () => api.resolveAnchor(short, null),
    'anchor-source-range': () => api.resolveAnchor(short, { ...selection, segments: [{ start: -1, end: 2 }] }),
    'source-edit-null': () => api.applySourceEdit(short, null),
    'source-edit-invalid': () => api.applySourceEdit(short, { from: 0.5, to: 1, text: '' }),
    'source-edit-text-type': () => api.applySourceEdit(short, { from: 0, to: 1, text: 3 }),
    'list-missing': () => api.anchorForListItem(listProjection, 'missing'),
    'list-task': () => api.anchorForListItem(api.projectMarkdown('- [ ] 任务'), '0.0'),
    'list-empty': () => api.anchorForListItem(api.projectMarkdown('- '), '0.0'),
    'note-link-identity': () => api.createNoteLinkUrl('note', 'short'),
    'identity-alignment-type': () => api.alignIdentityBlocks([], null)
  })) record(`error-${name}`, run);
  return cases;
}
