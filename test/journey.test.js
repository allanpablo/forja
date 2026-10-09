import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runJourney } from '../lib/core/journey.ts';

// ADR-0086: a jornada do usuário inteira (workspace → projeto → IA trabalhando nele), contra o fonte.
// O release:check roda a mesma jornada contra o pacote instalado (check `consumer-journey`).
test('jornada: projeto gerado nasce conectado e toda a inteligência responde dentro dele', { timeout: 300_000 }, () => {
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const steps = runJourney({ bin: path.resolve('bin/forja.ts'), pkgDir: process.cwd(), version });
  const failed = steps.filter((s) => !s.ok);
  assert.deepEqual(failed, [], failed.map((s) => `${s.id}: ${s.detail}`).join('\n'));
  assert.ok(steps.length >= 17, `jornada interrompida em ${steps.at(-1)?.id}`);
});
