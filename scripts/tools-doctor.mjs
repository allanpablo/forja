#!/usr/bin/env node
/**
 * tools-doctor — raio-x das ferramentas de processo (ADR-0018).
 *
 * Detecta binarios opcionais que potencializam o harness. Nunca impoe:
 * reporta instalado/ausente + como instalar. Governanca decide quais gates
 * ativar conforme disponibilidade.
 *
 * Uso: node scripts/tools-doctor.mjs
 */

import { spawnSync } from 'node:child_process';

const TOOLS = [
  {
    name: 'codegraph',
    probe: ['codegraph', ['--version']],
    role: 'Code intelligence: chamadores, blast radius, mapa de impacto (ADR-0017).',
    install: 'npm i -g @codegraph/cli',
    gate: 'npm run code:check / code:impact',
  },
  {
    name: 'gitleaks',
    probe: ['gitleaks', ['version']],
    role: 'Varredura de segredos antes de merge/release.',
    install: 'https://github.com/gitleaks/gitleaks (binario) ou: brew install gitleaks',
    gate: 'gitleaks detect --no-banner (gate de Governance)',
  },
  {
    name: 'ast-grep',
    probe: ['ast-grep', ['--version']],
    role: 'Busca e codemod estrutural por AST — refactor seguro do Worker.',
    install: 'npm i -g @ast-grep/cli  (binarios: ast-grep / sg)',
    gate: 'ast-grep run -p "<pattern>" -r "<rewrite>"',
  },
  {
    name: 'lefthook',
    probe: ['lefthook', ['version']],
    role: 'Pre-commit rodando project:check / spec:check automaticamente.',
    install: 'npm i -g lefthook  (depois: lefthook install)',
    gate: '.lefthook.yml (pre-commit)',
  },
  {
    name: 'markdownlint',
    probe: ['markdownlint-cli2', ['--version']],
    role: 'Lint da documentacao (docs e memory sao centrais aqui).',
    install: 'npm i -g markdownlint-cli2',
    gate: 'markdownlint-cli2 "docs/**/*.md"',
  },
];

function detect(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.error && res.error.code === 'ENOENT') return { ok: false };
  const version = (res.stdout || res.stderr || '').trim().split('\n')[0] || 'instalado';
  return { ok: true, version };
}

function main() {
  console.log('\nTools doctor — ferramentas de processo (ADR-0018)\n');
  let installed = 0;
  for (const tool of TOOLS) {
    const [cmd, args] = tool.probe;
    const { ok, version } = detect(cmd, args);
    if (ok) installed += 1;
    const tag = ok ? 'OK  ' : 'FALTA';
    console.log(`${tag} ${tool.name.padEnd(13)} ${ok ? version : '(ausente)'}`);
    console.log(`      papel: ${tool.role}`);
    console.log(`      gate:  ${tool.gate}`);
    if (!ok) console.log(`      instalar: ${tool.install}`);
    console.log('');
  }
  console.log(`Resumo: ${installed}/${TOOLS.length} ferramentas disponiveis.`);
  console.log('Ferramentas ausentes apenas desativam seus gates — o fluxo nunca trava por elas.');
}

main();
