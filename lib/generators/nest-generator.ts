/**
 * Nest Generator - Gera estrutura completa NestJS
 * Extraído de create-memory-nest-kit.js para modularização
 */

import path from 'node:path';
import { writeFileSafe, ensureDir, maybeGitkeep } from '../utils/file-helpers.ts';

/**
 * Factory de templates NestJS dinâmicos
 * Recebe projectName para interpolar em package.json
 */
function createNestTemplates(projectName: any) {
  return {
    // Backend alinhado ao `nest new` do NestJS 12 (ESM + nodenext, Vitest, oxlint). O Nest 12 é
    // ESM-only: o template CommonJS + Jest anterior compilava, mas `npm test` não carregava.
    'backend/package.json': `{
  "name": "${projectName}-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "format": "prettier --write \\"src/**/*.ts\\" \\"test/**/*.ts\\"",
    "lint": "oxlint --type-aware src/ test/",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts",
    "memory:db:sync": "cd .. && forja sync:universal",
    "memory:db:query": "cd .. && forja query:universal",
    "memory:watch": "node ../scripts/memory-watcher.mjs"
  },
  "dependencies": {
    "@nestjs/common": "^12.1.2",
    "@nestjs/core": "^12.1.2",
    "@nestjs/platform-express": "^12.1.2",
    "better-sqlite3": "^13.0.3",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@nestjs/cli": "^12.0.8",
    "@nestjs/schematics": "^12.0.6",
    "@nestjs/testing": "^12.1.2",
    "@types/better-sqlite3": "^9.6.0",
    "@types/express": "^5.0.6",
    "@types/node": "^26.6.4",
    "@types/supertest": "^7.2.1",
    "@vitest/coverage-v8": "^5.0.3",
    "oxlint": "^1.87.0",
    "oxlint-tsgolint": "^7.0.2003",
    "prettier": "^3.9.9",
    "source-map-support": "^0.5.21",
    "supertest": "^7.3.1",
    "typescript": "^6.0.3",
    "vite-tsconfig-paths": "^6.1.1",
    "vitest": "^5.0.3"
  }
}
`,

    'backend/nest-cli.json': `{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
`,

    'backend/tsconfig.json': `{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "types": ["vitest/globals", "node"]
  }
}
`,

    'backend/tsconfig.build.json': `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
`,

    'backend/vitest.config.ts': `import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
`,

    'backend/vitest.config.e2e.ts': `import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
  },
});
`,

    'backend/.oxlintrc.json': `{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "rules": {
    "typescript/no-explicit-any": "off",
    "typescript/no-floating-promises": "error"
  },
  "env": {
    "node": true
  }
}
`,

    'backend/src/main.ts': `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Chama o onModuleDestroy de cada provider (ex.: OpsService fechando o SQLite) em SIGINT/SIGTERM.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

await bootstrap();
`,

    'backend/src/app.module.ts': `import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OpsModule } from './modules/ops/ops.module.js';

@Module({
  imports: [OpsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`,

    'backend/src/app.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health(): { status: string } {
    return this.appService.health();
  }
}
`,

    'backend/src/app.service.ts': `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health(): { status: string } {
    return { status: 'ok' };
  }
}
`,

    // Painel operacional ligado à memória do Forja (memory/sqlite/universal.db do projeto): specs,
    // handoffs e memória indexada. Antes lia um .memory/sqlite/context.db que nunca existia e o
    // backend lançava ao subir.
    'backend/src/modules/ops/ops.service.ts': `import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface OpsStats {
  readonly indexed: boolean;
  readonly specs: { slug: string; status: string; title: string }[];
  readonly handoffs: { id: number; from_agent: string; to_agent: string; intent: string; status: string; created_at: string }[];
  readonly memory: { kind: string; count: number }[];
}

const EMPTY: OpsStats = { indexed: false, specs: [], handoffs: [], memory: [] };

@Injectable()
export class OpsService implements OnModuleDestroy {
  private readonly db: Database.Database | null;

  constructor() {
    // O backend roda em <projeto>/backend; a memória do projeto fica em <projeto>/memory/sqlite.
    const dbPath = process.env.FORJA_DB ?? resolve(process.cwd(), '..', 'memory', 'sqlite', 'universal.db');
    this.db = existsSync(dbPath) ? new Database(dbPath, { readonly: true, fileMustExist: true }) : null;
  }

  private all<T>(sql: string): T[] {
    try {
      return (this.db?.prepare(sql).all() as T[]) ?? [];
    } catch {
      return []; // tabela ainda não criada (ex.: nenhum handoff registrado)
    }
  }

  getStats(): OpsStats {
    if (!this.db) return EMPTY;
    return {
      indexed: true,
      specs: this.all('SELECT slug, status, title FROM spec_summaries ORDER BY slug'),
      handoffs: this.all("SELECT id, from_agent, to_agent, intent, status, created_at FROM handoffs WHERE status IN ('open','in_progress') ORDER BY id DESC LIMIT 10"),
      memory: this.all('SELECT kind, COUNT(*) AS count FROM memory_nodes GROUP BY kind ORDER BY count DESC'),
    };
  }

  onModuleDestroy(): void {
    this.db?.close();
  }
}
`,

    'backend/src/modules/ops/ops.controller.ts': `import { Controller, Get, Header } from '@nestjs/common';
import { OpsService, type OpsStats } from './ops.service.js';

/** Escapa HTML: os dados vêm de arquivos e handoffs livres. */
function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function list<T>(items: T[], empty: string, row: (item: T) => string): string {
  return items.length ? items.map(row).join('') : \`<li class="muted">\${empty}</li>\`;
}

export function renderOps(stats: OpsStats): string {
  const body = stats.indexed
    ? \`<section><h2>Specs</h2><ul>\${list(stats.specs, 'nenhuma spec — forja spec:new <slug>', (s) => \`<li><b>\${esc(s.slug)}</b> <span class="tag">\${esc(s.status)}</span> \${esc(s.title)}</li>\`)}</ul></section>
       <section><h2>Handoffs em aberto</h2><ul>\${list(stats.handoffs, 'nenhum handoff em aberto', (h) => \`<li>#\${esc(h.id)} \${esc(h.from_agent)} → \${esc(h.to_agent)} <span class="tag">\${esc(h.intent)}</span></li>\`)}</ul></section>
       <section><h2>Memória indexada</h2><ul>\${list(stats.memory, 'memória vazia', (m) => \`<li>\${esc(m.kind)}: \${esc(m.count)}</li>\`)}</ul></section>\`
    : '<p class="muted">Memória ainda não indexada. Rode <code>forja sync:universal</code> na raiz do projeto.</p>';
  return \`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>Ops — Forja</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 2rem; }
    main { max-width: 960px; margin: 0 auto; display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    h1 { max-width: 960px; margin: 0 auto 1.5rem; font-size: 1.5rem; }
    section { background: #1e293b; border-radius: 12px; padding: 1rem 1.25rem; }
    h2 { font-size: 1rem; margin-top: 0; } ul { list-style: none; padding: 0; margin: 0; } li { padding: .35rem 0; border-bottom: 1px solid #334155; }
    .tag { background: #334155; border-radius: 6px; padding: 0 .4rem; font-size: .8rem; } .muted { color: #94a3b8; }
  </style>
</head>
<body><h1>Ops do projeto</h1><main>\${body}</main></body>
</html>\`;
}

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('stats')
  getStats(): OpsStats {
    return this.opsService.getStats();
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderDashboard(): string {
    return renderOps(this.opsService.getStats());
  }
}
`,

    'backend/src/modules/ops/ops.module.ts': `import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller.js';
import { OpsService } from './ops.service.js';

@Module({
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
`,

    'backend/src/app.controller.spec.ts': `import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('health() deve retornar status ok', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
`,

    'backend/test/app.e2e-spec.ts': `import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/health (GET)', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
  });

  it('/api/ops/stats (GET) responde mesmo sem memória indexada', async () => {
    const res = await request(app.getHttpServer()).get('/api/ops/stats').expect(200);
    expect(res.body).toHaveProperty('indexed');
  });
});
`,

    'backend/.prettierrc': `{
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "printWidth": 100,
  "arrowParens": "always"
}
`,
  };
}

/**
 * Gera estrutura completa do NestJS backend
 * @param {string} baseDir - Diretório base
 * @param {string} projectName - Nome do projeto
 * @param {Object} options - Opções (force, noGitkeep)
 */
export function generateNestStructure(baseDir: any, projectName: any, options = {}) {
  const dynamicTemplates = createNestTemplates(projectName);
  // A memória do projeto é a universal do Forja (forja sync:universal); o banco paralelo do backend
  // (memory-db-*.mjs) nunca foi gerado e seus scripts apontavam para o vazio — removido na v5.
  const allTemplates = { ...dynamicTemplates };

  // Escrever todos os arquivos
  for (const [relativePath, content] of Object.entries(allTemplates)) {
    writeFileSafe(path.join(baseDir, relativePath), content, options);
  }

  // Criar diretórios vazios estruturados
  const emptyDirs = [
    'backend/src/common',
    'backend/src/common/decorators',
    'backend/src/common/filters',
    'backend/src/common/guards',
    'backend/src/common/interceptors',
    'backend/src/common/pipes',
    'backend/src/database',
    'backend/test/fixtures',
  ];

  for (const relDir of emptyDirs) {
    const abs = path.join(baseDir, relDir);
    ensureDir(abs);
    maybeGitkeep(abs, options);
  }

  return {
    success: true,
    filesWritten: Object.keys(allTemplates).length,
    emptyDirsCreated: emptyDirs.length,
  };
}

export default {
  generateNestStructure,
};
