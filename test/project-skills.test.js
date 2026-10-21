import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { templateSkills, skillProblem, citedForjaCommands, ROLES } from '../lib/project-wiring.ts';
import { COMMANDS } from '../lib/core/registry.ts';

// SPEC-051: as skills que o projeto recebe precisam ser carregáveis e coerentes entre si e com o Forja.
const dir = path.join('templates', 'project', 'skills');
const names = templateSkills();
const read = (n) => fs.readFileSync(path.join(dir, n, 'SKILL.md'), 'utf8');

test('skills do projeto: 34, cada uma com frontmatter válido e name = pasta', () => {
  assert.equal(names.length, 34);
  for (const n of names) assert.equal(skillProblem(n, read(n)), null, n);
});

test('skills do projeto: descrição em pt-BR dizendo quando usar', () => {
  for (const n of names) assert.match(read(n), /^description: Use (quando|depois|antes)/m, n);
});

test('skills do projeto: toda skill citada por outra existe no conjunto', () => {
  const missing = [];
  for (const n of names) {
    for (const m of read(n).matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)) {
      const ref = m[1];
      if ((/^(ts|go)-/.test(ref) && !['ts-morph', 'ts-jest', 'ts-node'].includes(ref)) || /(review|testing|modeling|record|spike|design|migrations|evaluation|elicitation|gathering|slicing|checklist|postmortem|compliance|writing|message|request|notes|mapping|storming|spec|layout|patterns|performance|observability)$/.test(ref)) {
        if (!names.includes(ref) && !['no-floating-promises'].some((x) => ref.endsWith(x))) missing.push(`${n} → ${ref}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('skills do projeto: todo `forja <comando>` citado existe no registry', () => {
  const unknown = [];
  for (const n of names) for (const c of citedForjaCommands(read(n))) if (!(c in COMMANDS) && c !== 'help') unknown.push(`${n}: ${c}`);
  assert.deepEqual(unknown, []);
});

test('skills que geram artefatos do Forja trazem a seção "No Forja"', () => {
  for (const n of ['architecture-decision-record', 'requirements-gathering', 'backlog-slicing', 'prompt-spec', 'incident-postmortem', 'release-notes', 'domain-modeling', 'testing']) {
    assert.match(read(n), /^## No Forja$/m, n);
  }
});

test('cada sub-agent de papel lista skills que existem', () => {
  for (const role of ROLES) {
    const s = fs.readFileSync(path.join('templates', 'project', 'agents', `${role}.md`), 'utf8');
    const sec = s.slice(s.indexOf('## Skills'), s.indexOf('## Entrega esperada'));
    const listed = [...sec.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).filter((x) => !x.startsWith('.'));
    assert.ok(listed.length > 0, `${role} sem skills`);
    for (const n of listed) assert.ok(names.includes(n), `${role} cita ${n}, inexistente`);
  }
});
