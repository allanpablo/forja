#!/usr/bin/env node
/**
 * docs:gen — regenera docs/commands.md a partir do registry (SPEC-055).
 *
 * A referência completa de comandos é derivada, nunca escrita à mão: o registry é a fonte única e o
 * check `commands-ref` do doctor compara o arquivo com o que este script produz. Rodar é idempotente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS } from '../lib/core/registry.ts';
import { renderCommandsDoc, skillsCount } from '../lib/docs-reference.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs/commands.md');

const skills = skillsCount(fs, path.join(ROOT, 'templates', 'project', 'skills'));
const doc = renderCommandsDoc(COMMANDS, skills);
fs.writeFileSync(TARGET, doc);
console.log(`docs/commands.md gerado: ${Object.keys(COMMANDS).length} comandos em ${new Set(Object.values(COMMANDS).map((c) => c.domain)).size} domínios, ${skills} skills.`);
