import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// The `--json` block is the last pretty-printed JSON.stringify(..., null, 2) value in stdout,
// appended after the human-readable report — extract from its opening brace to the end.
function lastJsonBlock(stdout) {
  const start = stdout.lastIndexOf('\n{\n');
  return JSON.parse(stdout.slice(start + 1).trim());
}

// SPEC-029 AC-5/AC-6: `cost:economy` agrega custo real (não estimativa de fixture) a partir das
// observações que `llm:run` já grava — o mesmo `ObservationStore` que `llm:eval` usa.
test('cost:economy reporta custo real acumulado a partir de uma execução llm:run com preço conhecido', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-cost-economy-'));
  const root = path.resolve(import.meta.dirname, '..');
  const run = (args) => spawnSync(process.execPath, [path.join(root, 'bin', 'forja.ts'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: workspace } });
  try {
    assert.equal(run(['workspace:init']).status, 0);
    assert.equal(run(['llm:profiles:init']).status, 0);

    const profilePath = path.join(workspace, '.context', 'llm-profiles.json');
    const configured = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    // provider "openai" não é tratado especialmente em buildLlmExecution (cai no branch genérico:
    // args = [...base, prompt]), então nenhuma flag extra chega ao subprocesso de fixture (node -e).
    // "openai:gpt-4o" tem entrada real em lib/core/model-pricing.json.
    configured.profiles.fixture = {
      provider: 'openai', model: 'gpt-4o', command: process.execPath,
      commandArgs: ['-e', 'process.stdout.write("x".repeat(4000))'], roles: ['worker'],
      taskTypes: ['test'], privacy: 'local', enabled: true,
    };
    fs.writeFileSync(profilePath, JSON.stringify(configured));
    const executed = run(['llm:run', '--profile', 'fixture', '--prompt', 'hello world']);
    assert.equal(executed.status, 0);
    const executedOutput = JSON.parse(executed.stdout);
    assert.equal(executedOutput.model, 'openai:gpt-4o');
    assert.ok(executedOutput.costUsd > 0, 'observation recorded by llm:run should carry a real computed cost');

    const reported = run(['cost:economy', '--json']);
    assert.equal(reported.status, 0);
    const report = lastJsonBlock(reported.stdout);
    assert.equal(report.observationCount, 1);
    assert.equal(report.unknownPricingCount, 0);
    assert.ok(report.totalCostUsd > 0);
    assert.ok(report.byModel['openai:gpt-4o']);
    assert.equal(report.byModel['openai:gpt-4o'].priceKnown, true);
    assert.ok(Math.abs(report.totalCostUsd - executedOutput.costUsd) < 1e-9);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// AC-4: um modelo sem entrada na tabela de preço não impede a execução nem quebra o relatório —
// só fica sinalizado como "preço desconhecido", tanto no aviso de llm:run quanto no relatório.
test('cost:economy segue funcionando (fail-open) quando a observação usa um modelo sem preço na tabela', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-cost-economy-unknown-'));
  const root = path.resolve(import.meta.dirname, '..');
  const run = (args) => spawnSync(process.execPath, [path.join(root, 'bin', 'forja.ts'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: workspace } });
  try {
    assert.equal(run(['workspace:init']).status, 0);
    assert.equal(run(['llm:profiles:init']).status, 0);

    const profilePath = path.join(workspace, '.context', 'llm-profiles.json');
    const configured = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    configured.profiles.fixture = {
      provider: 'mystery-provider', model: 'v9', command: process.execPath,
      commandArgs: ['-e', 'process.stdout.write("ok")'], roles: ['worker'],
      taskTypes: ['test'], privacy: 'local', enabled: true,
    };
    fs.writeFileSync(profilePath, JSON.stringify(configured));
    const executed = run(['llm:run', '--profile', 'fixture', '--prompt', 'hello world']);
    assert.equal(executed.status, 0, executed.stderr);
    assert.match(executed.stderr, /preço desconhecido/i);
    const executedOutput = JSON.parse(executed.stdout);
    assert.equal(executedOutput.costUsd, null);
    assert.equal(executedOutput.costSource, 'unknown');

    const reported = run(['cost:economy', '--json']);
    assert.equal(reported.status, 0);
    const report = lastJsonBlock(reported.stdout);
    assert.equal(report.observationCount, 1);
    assert.equal(report.unknownPricingCount, 1);
    assert.equal(report.byModel['mystery-provider:v9'].priceKnown, false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
