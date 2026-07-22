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
    'backend/package.json': `{
  "name": "${projectName}-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \\"src/**/*.ts\\" --max-warnings=0",
    "format": "prettier --write \\"src/**/*.ts\\" \\"test/**/*.ts\\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "memory:db:init": "node scripts/memory-db-init.mjs",
    "memory:db:sync": "node scripts/memory-db-sync.mjs",
    "memory:db:query": "node scripts/memory-db-query.mjs",
    "memory:watch": "node ../scripts/memory-watcher.mjs"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\\\.spec\\\\.ts$",
    "transform": {
      "^.+\\\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "better-sqlite3": "^12.11.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/express": "^5.0.1",
    "@types/better-sqlite3": "^7.6.13",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.16.0",
    "eslint-config-prettier": "^9.1.0",
    "jest": "^29.7.0",
    "prettier": "^3.4.2",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.7.2"
  }
}
`,

    'backend/nest-cli.json': `{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
`,

    'backend/tsconfig.json': `{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "es2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true
  }
}
`,

    'backend/tsconfig.build.json': `{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
`,

    'backend/src/main.ts': `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
`,

    'backend/src/app.module.ts': `import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { OpsModule } from "./modules/ops/ops.module";

@Module({
  imports: [OpsModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
`,

    'backend/src/app.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

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

    'backend/src/modules/ops/ops.service.ts': `import { Injectable } from '@nestjs/common';
import * as Database from 'better-sqlite3';
import * as path from 'node:path';

@Injectable()
export class OpsService {
  private db: any;

  constructor() {
    const dbPath = path.resolve(process.cwd(), '..', '.memory', 'sqlite', 'context.db');
    this.db = new (Database as any)(dbPath, { readonly: true });
  }

  getStats() {
    const agents = this.db.prepare('SELECT agent_name, status, current_task FROM agent_sessions').all();
    const tasks = this.db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
    const handoffs = this.db.prepare('SELECT from_agent, to_agent, title, created_at FROM handoffs ORDER BY created_at DESC LIMIT 5').all();
    
    return { agents, tasks, handoffs };
  }
}
`,

    'backend/src/modules/ops/ops.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('stats')
  getStats() {
    return this.opsService.getStats();
  }

  @Get()
  renderDashboard() {
    const stats = this.opsService.getStats();
    
    return \`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Agentes Ops Dashboard</title>
          <script src="https://cdn.tailwindcss.com"><\/script>
          <meta http-equiv="refresh" content="30">
      </head>
      <body class="bg-gray-900 text-gray-100 font-sans p-8">
          <div class="max-w-6xl mx-auto">
              <header class="flex justify-between items-center mb-12">
                  <h1 class="text-3xl font-bold text-blue-400">🚀 Agentes Operacionais</h1>
                  <div class="text-sm text-gray-400">Sincronizado via SQLite</div>
              </header>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <!-- Agentes -->
                  <section class="bg-gray-800 p-6 rounded-xl border border-gray-700">
                      <h2 class="text-xl font-semibold mb-4 flex items-center">
                          <span class="mr-2">🤖</span> Status dos Agentes
                      </h2>
                      <div class="space-y-4">
                          \${stats.agents.map((a: any) => \`
                              <div class="p-3 bg-gray-900 rounded-lg border-l-4 \${a.status === 'IDLE' ? 'border-green-500' : 'border-yellow-500'}">
                                  <div class="font-bold">\${a.agent_name}</div>
                                  <div class="text-xs text-gray-400">\${a.status} \${a.current_task ? ' - ' + a.current_task : ''}</div>
                              </div>
                          \`).join('')}
                      </div>
                  </section>

                  <!-- Tarefas -->
                  <section class="bg-gray-800 p-6 rounded-xl border border-gray-700">
                      <h2 class="text-xl font-semibold mb-4 flex items-center">
                          <span class="mr-2">📊</span> Backlog & Progresso
                      </h2>
                      <div class="space-y-4">
                          \${stats.tasks.map((t: any) => \`
                              <div class="flex justify-between items-center">
                                  <span class="capitalize">\${t.status}</span>
                                  <span class="bg-blue-600 px-2 py-1 rounded text-xs">\${t.count}</span>
                              </div>
                          \`).join('')}
                      </div>
                  </section>

                  <!-- Handoffs -->
                  <section class="bg-gray-800 p-6 rounded-xl border border-gray-700">
                      <h2 class="text-xl font-semibold mb-4 flex items-center">
                          <span class="mr-2">🤝</span> Últimos Handoffs
                      </h2>
                      <div class="space-y-3">
                          \${stats.handoffs.map((h: any) => \`
                              <div class="text-xs border-b border-gray-700 pb-2">
                                  <div class="text-blue-300 font-medium">\${h.from_agent} → \${h.to_agent}</div>
                                  <div class="text-gray-400 truncate">\${h.title}</div>
                              </div>
                          \`).join('')}
                      </div>
                  </section>
              </div>

              <footer class="mt-12 text-center text-gray-500 text-xs">
                  Atualizado em: \${new Date().toLocaleString('pt-BR')} | create-memory-nest-kit v0.5.0
              </footer>
          </div>
      </body>
      </html>
    \`;
  }
}
`,

    'backend/src/modules/ops/ops.module.ts': `import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  controllers: [OpsController],
  providers: [OpsService]
})
export class OpsModule {}
`,

    'backend/src/app.controller.spec.ts': `import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService]
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
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/health (GET)', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
`,

    'backend/jest-e2e.json': `{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\\\.(t|j)s$": "ts-jest"
  }
}
`,

    'backend/.eslintrc.json': `{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "tsconfig.json",
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint/eslint-plugin"],
  "extends": ["plugin:@typescript-eslint/recommended", "prettier"],
  "root": true,
  "env": {
    "node": true,
    "jest": true
  },
  "ignorePatterns": [".eslintrc.js"],
  "rules": {
    "@typescript-eslint/interface-name-prefix": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-explicit-any": "off"
  }
}
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
 * Templates dos scripts de banco de dados (estáticos)
 */
const databaseScriptTemplates = {
  'backend/scripts/memory-db-schema.sql': `PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_unique
ON document_chunks (document_id, chunk_index);

CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  from_agent TEXT,
  to_agent TEXT,
  title TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS adrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adr_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'accepted',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_scope
ON summaries (scope, scope_key);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner_agent TEXT,
  source_file TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'IDLE',
  current_task TEXT,
  updated_at TEXT NOT NULL
);
`,
};

/**
 * Gera estrutura completa do NestJS backend
 * @param {string} baseDir - Diretório base
 * @param {string} projectName - Nome do projeto
 * @param {Object} options - Opções (force, noGitkeep)
 */
export function generateNestStructure(baseDir: any, projectName: any, options = {}) {
  const dynamicTemplates = createNestTemplates(projectName);
  const allTemplates = { ...dynamicTemplates, ...databaseScriptTemplates };

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
