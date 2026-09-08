/**
 * lib/multi-ai-instructions.ts — as instruções nativas por IA de um projeto gerado (SPEC-047).
 *
 * Conteúdo canônico ÚNICO (ADR-0020): toda IA recebe a mesma explicação da estrutura Forja;
 * só o cabeçalho muda. Extraído de `bin/init-project.ts step02CopyInstructions` para (a) ser
 * chamável pelo smoke sem passar pelo `init-project.ts` (que não roda em dev), e (b) dar ao
 * check de coerência (`project:smoke --ai`) a mesma fonte de verdade que a geração.
 */

import fs from 'node:fs';
import path from 'node:path';

export const CANONICAL_INSTRUCTIONS = '.gemini-instructions.md';

export const AI_LABELS: Readonly<Record<string, string>> = {
  copilot: 'GitHub Copilot',
  claude: 'Claude',
  gemini: 'Gemini',
  codex: 'OpenAI Codex',
};

/** Linhas de cabeçalho que `writeAiInstructions` reescreve por IA — antes e depois. */
const HEADER_LINE_RES: readonly RegExp[] = [
  /^# Instruções para .+ — Forja$/,
  /^> Guia para .+ multi-IA por design\.$/,
];

/**
 * Remove as linhas de cabeçalho (as que diferem entre IAs) para comparar só o corpo.
 * Usado pelo check `aiInstructionsCoherent`: dois `<ai>.md` da mesma geração devem ter corpo
 * idêntico byte a byte depois disto.
 */
export function stripInstructionHeader(text: string): string {
  return text
    .split('\n')
    .filter((line) => !HEADER_LINE_RES.some((re) => re.test(line)))
    .join('\n');
}

export interface WriteAiInstructionsResult {
  readonly written: string[];
  readonly skipped: string[];
}

/**
 * Escreve `.ia-instructions/<ai>.md` (um por IA), `README.md` e `models.json` em `projectDir`,
 * todos derivados de `<kitRoot>/.gemini-instructions.md`. `kitRoot` é a raiz do framework.
 * Nunca lança por IA desconhecida — pula e reporta em `skipped`.
 */
export function writeAiInstructions(
  projectDir: string,
  aiList: readonly string[],
  { kitRoot }: { kitRoot: string },
): WriteAiInstructionsResult {
  const instructionsDir = path.join(projectDir, '.ia-instructions');
  fs.mkdirSync(instructionsDir, { recursive: true });

  const canonicalPath = path.join(kitRoot, CANONICAL_INSTRUCTIONS);
  const canonical = fs.existsSync(canonicalPath) ? fs.readFileSync(canonicalPath, 'utf8') : null;

  const written: string[] = [];
  const skipped: string[] = [];

  for (const ai of aiList) {
    const label = AI_LABELS[ai];
    if (!label || !canonical) {
      skipped.push(ai);
      continue;
    }
    const others = Object.entries(AI_LABELS)
      .filter(([key]) => key !== ai)
      .map(([, name]) => name);
    const content = canonical
      .replace(/^# Instruções para .+ — Forja$/m, `# Instruções para ${label} — Forja`)
      .replace(
        /^> Guia para .+ multi-IA por design\.$/m,
        `> Guia para ${label} operar a Forja. O conteúdo é o mesmo para ${others.slice(0, -1).join(', ')} e ${others.at(-1)} — a Forja é multi-IA por design.`,
      );
    fs.writeFileSync(path.join(instructionsDir, `${ai}.md`), content, 'utf8');
    written.push(ai);
  }

  const indexContent = `# IA Assistants Configuration

Este diretório contém instruções específicas para cada IA assistant.

## Gestão de Cotas & Alternância
Para trocar de IA (ex: se acabar a cota), use o arquivo [models.json](./models.json) para identificar o próximo motor na fila de fallback.

## IAs Configuradas

${aiList.map((ai) => `- [${ai.toUpperCase()}](./${ai}.md)`).join('\n')}
`;
  fs.writeFileSync(path.join(instructionsDir, 'README.md'), indexContent);

  const modelsJson = {
    active_engine: aiList[0] || 'copilot',
    fallback_chain: [...aiList],
    engines: aiList.reduce<Record<string, unknown>>((acc, ai) => {
      acc[ai] = { name: ai.toUpperCase(), instruction_file: `.ia-instructions/${ai}.md`, status: 'ready' };
      return acc;
    }, {}),
  };
  fs.writeFileSync(path.join(instructionsDir, 'models.json'), JSON.stringify(modelsJson, null, 2));

  return { written, skipped };
}
