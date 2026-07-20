import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Regressão do bug da v1.6.0: `project:upgrade` (e `project:smoke`) quebravam no pacote PUBLICADO com
 * "Cannot find module .../create-memory-nest-kit.ts" — o spawn cravava a extensão `.ts`, e o dist só
 * tem `.js`. O fix é resolver o gerador dinamicamente com `resolveScript` (tenta .ts→.js→.mjs).
 *
 * Este teste é a rede para a classe: quem spawna o gerador não pode cravar `.ts`.
 */
for (const f of ['scripts/project-upgrade.ts', 'lib/core/project-smoke.ts']) {
  test(`${f} resolve o gerador com resolveScript, sem .ts hardcoded`, () => {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(
      src,
      /create-memory-nest-kit\.ts/,
      'não crave .ts no spawn — quebra no dist (que é .js)'
    );
    assert.match(src, /resolveScript\(/, 'resolve o gerador dinamicamente (.ts em dev, .js no dist)');
  });
}
