// Pré-carregado em toda a suíte (`node --test --import`): nenhum teste enxerga o workspace real do
// usuário. Sem isto, um teste que chama o CLI com `process.env` resolvia `~/forja-workspace` e
// gravava na trilha de auditoria real (`.context/forja-runs.jsonl`). O diretório não é criado: sem
// workspace, o core não audita. Testes que precisam de workspace definem o próprio FORJA_WORKSPACE.
import os from 'node:os';
import path from 'node:path';

if (!process.env.FORJA_TEST_WORKSPACE) {
  process.env.FORJA_TEST_WORKSPACE = path.join(os.tmpdir(), `forja-test-no-workspace-${process.pid}`);
}
process.env.FORJA_WORKSPACE = process.env.FORJA_TEST_WORKSPACE;

// Cobertura: só o processo de teste conta. Com `--experimental-test-coverage` o runner expõe
// NODE_V8_COVERAGE, e todo CLI filho (dezenas por suíte) herda isso e despeja no mesmo diretório um
// bloco parcial do próprio — o agregador do Node não faz união, então o mesmo arquivo aparece 100%
// numa execução e 51% na seguinte (`packages/adapter-nest/src/index.ts`, observado 2026-11-05, com
// branches e funções idênticos). A régua oscilava 85,7–87,4% sem que nada mudasse, ou seja: o ratchet
// de cobertura era ruído. Bloco de filho não é cobertura de teste — e um piso que não se repete não
// piso nenhum. Sem a variável (o `npm test` normal) este delete é no-op.
delete process.env.NODE_V8_COVERAGE;
