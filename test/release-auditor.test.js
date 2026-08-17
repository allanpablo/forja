import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prompt = fs.readFileSync(path.join(root, '.claude', 'agents', 'release-auditor.md'), 'utf8');

test('Release Auditor valida health antes do gate estrito do tarball', () => {
  const doctor = prompt.indexOf('npm run tools:doctor');
  const release = prompt.indexOf('npm run release:check -- --publish');

  assert.notEqual(doctor, -1, 'procedimento deve consumir a saude canonica via tools:doctor');
  assert.notEqual(release, -1, 'procedimento deve preservar release:check em modo --publish');
  assert.ok(doctor < release, 'tools:doctor deve rodar antes de release:check --publish');
});

test('Release Auditor audita, mas nunca publica', () => {
  assert.match(prompt, /nunca (?:rode|execute) `npm publish`/i);
});
