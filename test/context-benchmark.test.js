import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('context benchmark emits deterministic JSON with measured savings and cache evidence', () => {
  const output = execFileSync(process.execPath, ['scripts/context-benchmark.ts', '--json'], { encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.deterministic, true);
  assert.equal(result.forja.cacheHits, 1);
  assert.equal(result.forja.evidenceCoverage, 1);
  assert.ok(result.baseline.tokens > result.forja.tokens);
  assert.ok(result.savings > 0.5);
});
