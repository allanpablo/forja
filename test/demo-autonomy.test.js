import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runAutonomyDemo } from '../scripts/demo-autonomy.ts';

test('demo:autonomy prova sandbox Git real, aprovação, promoção e persistência', async () => {
  const result = await runAutonomyDemo();
  try {
    assert.equal(result.validation, 'accepted');
    assert.deepEqual(result.changedFiles, ['tests/math.test.js']);
    assert.ok(result.graphNodes > 0);
    assert.ok(result.graphEdges > 0);
    assert.ok(result.approvalId.length > 0);
    assert.ok(result.handoffId.length > 0);
    assert.match(fs.readFileSync(`${result.fixtureRoot}/tests/math.test.js`, 'utf8'), /add\(1, 1\), 2\)/);
    assert.ok(fs.existsSync(result.databasePath));
  } finally {
    fs.rmSync(result.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(result.sandboxRoot, { recursive: true, force: true });
  }
});
