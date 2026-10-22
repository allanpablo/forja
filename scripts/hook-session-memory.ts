#!/usr/bin/env node
/**
 * Hook Stop / PreCompact — grava o checkpoint da sessão em memory/60-runs/sessions/ (SPEC-052, ADR-0091).
 *
 * stdin: `{ session_id, transcript_path, cwd, hook_event_name }` (Claude Code). Nunca derruba a
 * sessão: qualquer falha sai com 0 e sem saída. Não escreve em stdout — no Stop, um JSON com
 * `decision` bloquearia o fim do turno.
 */

import fs from 'node:fs';
import path from 'node:path';
import { writeCheckpoint } from '../lib/session-memory.ts';

try {
  const input = process.stdin.isTTY ? {} : JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  if (typeof input.session_id === 'string' && typeof input.transcript_path === 'string' && fs.existsSync(input.transcript_path)) {
    writeCheckpoint(root, input.transcript_path, input.session_id, String(input.hook_event_name || 'Stop'));
  }
} catch { /* ADR-0091: o hook nunca derruba a sessão */ }
process.exit(0);
