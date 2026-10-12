import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const directory = new URL('../src/', import.meta.url);

test('实现直接依赖下层模块，公共出口不含算法且包内依赖无环', async () => {
  const files = (await readdir(directory)).filter(file => file.endsWith('.js'));
  const graph = new Map();
  for (const file of files) {
    const source = await readFile(new URL(file, directory), 'utf8');
    // Includes imports and re-exports: source-diff/dynamic once formed a second cycle.
    const dependencies = [...source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"]\.\/([^'"]+)['"]/g)].map(match => match[1]);
    graph.set(file, dependencies);
    if (file !== 'index.js') assert.ok(!dependencies.includes('index.js'), `${file} imports the public barrel`);
    else assert.doesNotMatch(source, /\b(?:function|class|const|let|var|import)\b/);
  }
  const visited = new Set();
  const visit = (file, path = []) => {
    assert.ok(!path.includes(file), `Dependency cycle: ${[...path, file].join(' -> ')}`);
    if (visited.has(file)) return;
    assert.ok(graph.has(file), `Missing implementation: ${file}`);
    for (const dependency of graph.get(file)) visit(dependency, [...path, file]);
    visited.add(file);
  };
  for (const file of files) visit(file);
});
