export const folderNormalizationVector = {
  input: [
    null,
    [],
    { id: 123, name: null, parentId: undefined, children: [{ id: 'child', children: [null] }] },
    { name: 'Missing id' }
  ],
  expected: [
    {
      id: '123',
      name: '未命名目录',
      parentId: null,
      children: [{ id: 'child', name: '未命名目录', parentId: null, children: [] }]
    }
  ]
};

export const recoveryVectors = [
  { input: { backendAvailable: true, cachedSnapshot: null }, expected: 'backend' },
  { input: { backendAvailable: false, cachedSnapshot: { folderTree: [], allNotes: [] } }, expected: 'cache' },
  { input: { backendAvailable: false, cachedSnapshot: null }, expected: 'mock' }
];
