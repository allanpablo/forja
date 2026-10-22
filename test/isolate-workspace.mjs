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
