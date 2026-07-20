/**
 * Testes para lib/generators e lib/validators.
 *
 * Migrado do harness custom legado para node:test: agora as asserções são contadas no tally, cada
 * teste é isolado, e — o que faltava — o tmp é limpo (o harness antigo vazava um diretório por
 * execução; centenas se acumularam em /tmp). Falha aqui passa a derrubar o CI de verdade.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateMemoryStructure } from '../lib/generators/memory-generator.ts';
import { generateNestStructure } from '../lib/generators/nest-generator.ts';
import { generateReadme } from '../lib/generators/readme-generator.ts';
import { validateProjectStructure } from '../lib/validators/structure-validator.ts';

/** Diretório temporário isolado + cleanup garantido — resolve o vazamento do harness antigo. */
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-gen-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- Memory Generator ---

test('generateMemoryStructure cria >50 arquivos e o mission.md', () => {
  withTempDir((dir) => {
    const result = generateMemoryStructure(dir, { noGitkeep: true });
    assert.ok(result.success, 'resultado deve ser sucesso');
    assert.ok(result.filesWritten > 50, `deve criar >50 arquivos, criou ${result.filesWritten}`);
    assert.ok(fs.existsSync(path.join(dir, 'memory/00-global/mission.md')), 'mission.md deve existir');
  });
});

test('generateMemoryStructure cria os diretórios estruturais', () => {
  withTempDir((dir) => {
    generateMemoryStructure(dir, { noGitkeep: true });
    assert.ok(fs.existsSync(path.join(dir, 'memory/30-domains/shared')), 'dir shared deve existir');
    assert.ok(fs.existsSync(path.join(dir, '.memory/sqlite')), 'dir SQLite deve existir');
  });
});

test('AGENTS.md é gerado com pt-BR e NestJS', () => {
  withTempDir((dir) => {
    generateMemoryStructure(dir, { noGitkeep: true });
    const content = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.match(content, /pt-BR/, 'AGENTS.md deve mencionar pt-BR');
    assert.match(content, /NestJS/, 'AGENTS.md deve mencionar NestJS');
  });
});

test('o gerador emite o gate herdado scripts/check-memory-maps.mjs (ADR-0030)', () => {
  withTempDir((dir) => {
    generateMemoryStructure(dir, { noGitkeep: true });
    const gate = path.join(dir, 'scripts', 'check-memory-maps.mjs');
    assert.ok(fs.existsSync(gate), 'o projeto gerado carrega o gate dos mapas');
    assert.match(fs.readFileSync(gate, 'utf8'), /30-domains|context\.md/, 'é o gate de coerência mapa↔código');
  });
});

// --- Nest Generator ---

test('generateNestStructure cria >10 arquivos', () => {
  withTempDir((dir) => {
    const result = generateNestStructure(dir, 'test-project', { noGitkeep: true });
    assert.ok(result.success, 'resultado deve ser sucesso');
    assert.ok(result.filesWritten > 10, `deve criar >10 arquivos, criou ${result.filesWritten}`);
  });
});

test('backend/package.json carrega o nome do projeto', () => {
  withTempDir((dir) => {
    generateNestStructure(dir, 'meu-projeto', { noGitkeep: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'backend/package.json'), 'utf8'));
    assert.equal(pkg.name, 'meu-projeto-api');
  });
});

// --- README Generator ---

test('generateReadme cria o README.md', () => {
  withTempDir((dir) => {
    const result = generateReadme(dir, 'test-project', { noGitkeep: true });
    assert.ok(result.success, 'resultado deve ser sucesso');
    assert.ok(fs.existsSync(result.path), 'README.md deve existir');
  });
});

// --- Structure Validator ---

test('validateProjectStructure aprova um projeto de memória válido', () => {
  withTempDir((dir) => {
    generateMemoryStructure(dir, { noGitkeep: true });
    generateReadme(dir, 'test', { noGitkeep: true });
    const result = validateProjectStructure(dir, { includeNest: false });
    assert.ok(result.isValid, `deve ser válido, erros: ${result.errors.join(', ')}`);
  });
});
