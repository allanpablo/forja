import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProject, initWorkspace } from '../lib/workspace.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [project] = process.argv.slice(2);

if (!project) {
  console.log('Uso: node scripts/compress-project-memory.js <projeto>');
  process.exit(0);
}

initWorkspace();
const projectDir = resolveProject(project);
const handoffDir = path.join(projectDir, 'memory/50-orchestration/handoffs');
const summaryFile = path.join(projectDir, 'memory/70-summaries/compressed-history.md');

function compress() {
  if (!fs.existsSync(handoffDir)) return console.log('Sem handoffs para comprimir.');

  const files = fs.readdirSync(handoffDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  if (files.length < 5) return console.log('Handoffs insuficientes para compressão significativa.');

  let compressedContent = `# Histórico Comprimido de Execução: ${project.toUpperCase()}\n\n`;
  compressedContent += `> Última compressão: ${new Date().toISOString()}\n\n`;

  for (const file of files) {
    const filePath = path.join(handoffDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extrai apenas o Título e as Alterações para o resumo
    const titleMatch = content.match(/^## Titulo\n(.+)$/m) || content.match(/^# Handoff: (.+)$/m);
    const changesMatch = content.match(/## Alteracoes\n([\s\S]*?)(?=##|$)/);

    if (titleMatch) {
      compressedContent += `### ${titleMatch[1].trim()} (${file.split('_')[0]})\n`;
      if (changesMatch) {
        compressedContent += `${changesMatch[1].trim()}\n\n`;
      }
    }
    
    // Opcional: Arquivar ou deletar o handoff original após compressão
    // fs.unlinkSync(filePath); 
  }

  fs.writeFileSync(summaryFile, compressedContent, 'utf8');
  console.log(`✅ Memória comprimida em: ${summaryFile}`);
  console.log(`📉 ${files.length} handoffs consolidados em um único arquivo de resumo.`);
}

try {
  compress();
} catch (e) {
  console.error('Erro na compressão:', e.message);
}
