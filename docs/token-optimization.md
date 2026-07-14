# 🎯 Token Optimization Guide

**Target**: 40-60% reduction in tokens per agent session through smart context, caching, and compression.

## Hooks ativos (ADR-0009)

| Hook | Quando dispara | O que faz |
|---|---|---|
| `SessionStart` → `scripts/hook-session-start.mjs` | Início da sessão Claude Code | Injeta status de specs e handoffs abertos (`additionalContext`) |
| `UserPromptSubmit` → `scripts/hook-user-prompt.mjs` | A cada prompt do usuário | **Opt-in**: só roda com `FRAMEWORK_HOOK_INJECT=1` e prompt casando triggers (`implement`, `refactor`, `spec:`, …). Cache TTL 30min |
| `pre-commit` (passos 6-7) | Antes de cada commit | `spec:check` + `check-standards`; bloqueia se inconsistente |

Para ativar a injeção automática de smart-context:

```bash
export FRAMEWORK_HOOK_INJECT=1
```

Caps em `.memoryrc.json::hooks.userPromptCap` (default 4KB). Cache em `/tmp/framework-hook-cache/`.

---

## 📊 Current State Analysis

### Baseline Metrics (Before Optimization)

| Metric | Value | Impact |
|--------|-------|--------|
| Average context size | 150-200 KB | High token cost |
| Files loaded per session | 30-50 | Redundant data |
| Cache hit rate | 0% | No reuse |
| Database size | 2.1 MB | Includes old logs |
| Compression | None | No optimization |

### Target After Optimization

| Metric | Current | Target | Savings |
|--------|---------|--------|---------|
| Context size | 150 KB | 60 KB | 60% ✅ |
| Files loaded | 40 | 15-20 | 50% |
| Cache hit rate | 0% | 70% | - |
| Database size | 2.1 MB | < 1 MB | 50% |
| Token cost | $0.015 | $0.006 | 60% ✅ |

---

## 🔧 3-Mode Context Strategy

### Mode 1: Global (Fastest - 2KB, ~500 tokens)

**Use case**: Startup, configuration decisions, standards

**Loads**:
- `mission.md` — Project mission
- `standards.md` — Code/doc standards
- `ADR-*` — Last 3 architecture decisions
- `.memoryrc.json` — Config

**Cost**: $0.0001 per request

```bash
node lib/context-builder.js global my-project
```

---

### Mode 2: Domain (Standard - 20KB, ~5000 tokens)

**Use case**: Feature development, architectural work

**Loads**:
- All from **Global**
- `vision.md` — Product vision
- `design-md/INDEX.md` — Design decisions
- `rules.md` — Business rules
- `[domain]/api.md` — Domain-specific API
- Recent `summary.md` files

**Cost**: $0.005 per request

```bash
node lib/context-builder.js domain my-project
```

---

### Mode 3: Task (Optimized - 30-40KB, ~8000 tokens)

**Use case**: Specific features, debugging, handoffs

**Loads**:
- All from **Domain**
- FTS5 search results for keyword
- Deduplicates overlaps
- Prunes unused sections

**Cost**: $0.008 per request

```bash
node lib/context-builder.js task my-project "auth backend"
```

---

## 🧠 Smart Context - How It Works

```
┌─────────────────────────────────────┐
│   User Query: "Implement JWT auth"  │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  1. Parse keyword: "JWT", "auth"    │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  2. Check cache: Hit? → Return      │
│     Miss? → Continue                │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  3. FTS5 search in memory_nodes     │
│     Find: auth-service, jwt-spec,   │
│     security-adr, etc (10 files)    │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  4. Add domain + global context     │
│     Total: ~20 files (deduped)      │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  5. Rank by relevance + recency     │
│     Keep top 15 (by token budget)   │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  6. Generate markdown + cache       │
│     ~30KB context (8000 tokens)     │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  7. Send to agent (from cache ✅)   │
└─────────────────────────────────────┘
```

---

## 📦 Compression Strategy

### Step 1: Archive Old Logs (30 days)

```bash
npm run memory:vacuum
```

**What happens**:
- Logs > 30 days moved to `.memory/archive/`
- Deleted from active DB
- Database VACUUM'd

**Expected savings**: 30-40% of DB size

### Step 2: Clean Cache (7-day TTL)

```bash
node scripts/compress-memory.mjs
```

**What happens**:
- Expired cache files deleted
- Empty nodes removed
- Index rebuilt

**Expected savings**: 20-30% more

### Step 3: Optimize Memory Runs

**Manual audit**:
```bash
# Find biggest runs
du -sh .memory/runs/* | sort -h | tail -10

# Archive manually if needed
mv .memory/runs/old-run-* .memory/archive/
```

---

## 💾 Configuration (.memoryrc.json)

### Set Token Limits

```json
{
  "tokenLimits": {
    "global": 2000,
    "domain": 5000,
    "task": 8000,
    "buffer": 500
  }
}
```

### Compression Settings

```json
{
  "compression": {
    "archiveAge": 30,
    "maxDbSize": 50,
    "cacheTtl": 7,
    "vacuumInterval": 86400000
  }
}
```

### Cache Strategy

```json
{
  "context": {
    "cache": {
      "enabled": true,
      "ttl": 604800000,
      "location": ".context/cache",
      "strategy": "lru"
    }
  }
}
```

---

## 📈 Benchmarking

### Run Benchmark

```bash
npm run token:benchmark
```

**What it does**:
1. Generate all 3 context modes
2. Measure size, token count, generation time
3. Compare with baseline
4. Report savings %

**Output example**:
```
📊 Token Economy Benchmark

Mode: global
  Size: 2.1 KB
  Tokens: 525
  Time: 45ms
  
Mode: domain
  Size: 18.5 KB
  Tokens: 4625
  Time: 120ms
  
Mode: task (keyword: "auth")
  Size: 31.2 KB
  Tokens: 7800
  Time: 180ms

Summary:
  ✅ 52% reduction vs original (full context)
  ✅ 70% cache hit rate
  ✅ Average generation: 115ms
  💰 Cost savings: $0.009/request
```

---

## 🎯 Optimization Techniques

### 1. Deduplication

**Problem**: Same files loaded in multiple modes.

**Solution**:
```javascript
const seenPaths = new Set();
for (const node of nodes) {
  if (seenPaths.has(node.path)) continue; // Skip
  seenPaths.add(node.path);
  // Add to context
}
```

**Savings**: 20-30%

---

### 2. Priority Weighting

**Problem**: Not all files equally important.

**Solution**:
```javascript
const priorities = {
  'mission.md': 10,
  'vision.md': 8,
  'rules.md': 6,
  'design-md/': 5,
  'implementation/': 2
};
```

**Savings**: 15-25%

---

### 3. Time Decay

**Problem**: Old files still included equally.

**Solution**:
```javascript
const age = (now - node.updatedAt) / (1000 * 60 * 60 * 24); // days
const weight = Math.exp(-age / 30); // Decay over 30 days
if (weight < 0.1) skip(); // Drop very old files
```

**Savings**: 10-20%

---

### 4. Relevance Ranking

**Problem**: FTS5 results not always ranked best.

**Solution**:
```javascript
const relevanceScore = 
  (titleMatch * 3) + 
  (contentMatch * 1) + 
  (recencyBoost * 0.5) +
  (domainMatch * 2);

nodes.sort((a, b) => b.score - a.score);
nodes = nodes.slice(0, maxFiles); // Keep top N
```

**Savings**: 25-40%

---

## 🚀 Integration with Agent Workflow

### For Backend Worker

```javascript
import ContextBuilder from '../lib/context-builder.js';

// On task start
const builder = new ContextBuilder(process.cwd(), dbPath);
const context = builder.build('task', 'my-project', 'backend auth');
const stats = builder.stats('task', 'my-project', 'backend auth');

console.log(`📊 Using ${stats.tokens} tokens (cost: $${stats.estimatedCost})`);

// Send context to agent
await agent.exec(task, context);

builder.close();
```

### For Frontend Worker

```javascript
// More domain-focused
const context = builder.build('domain', 'my-project');
```

### For Orchestrator

```javascript
// Global context only (faster handoff)
const context = builder.build('global', 'my-project');
```

---

## 📋 Pre-Flight Checklist

- [ ] `.memoryrc.json` created with token limits
- [ ] `lib/context-builder.js` integrated
- [ ] `scripts/compress-memory.mjs` tested
- [ ] Cache directory created: `.context/cache/`
- [ ] Archive directory created: `.memory/archive/`
- [ ] FTS5 index enabled in universal.db
- [ ] Benchmark run: `npm run token:benchmark`
- [ ] Savings > 40%? Deploy!

---

## 🎓 Common Patterns

### Scenario 1: Feature Development

```bash
# Developer needs feature context
npm run context:smart -- task my-project "payment feature"
# Uses cached domain + task-specific files
# Result: ~30KB, ~7500 tokens, $0.0075
```

### Scenario 2: Security Review

```bash
# Security agent needs all related context
npm run context:smart -- domain my-project
# Adds security rules, ADRs, design docs
# Result: ~20KB, ~5000 tokens, $0.005
```

### Scenario 3: Onboarding New Developer

```bash
# New dev needs big picture
npm run context:smart -- global my-project
# Just mission, standards, recent ADRs
# Result: ~2KB, ~500 tokens, $0.0005
```

---

## 📞 Troubleshooting

### Context Too Large?

```bash
# Try smaller mode
npm run context:smart -- global  # Instead of domain

# Or prune manually
npm run memory:compress
npm run memory:vacuum
```

### FTS5 Queries Slow or Stale?

```bash
# Rebuild the index (it is also what fixes a stale index)
npm run sync:universal

# The doctor tells you when the index is behind memory/ — it is the
# failure that costs the most and shows the least (ADR-0023).
npm run tools:doctor
```

### Cache Not Working?

```bash
# Clear cache
rm -rf .context/cache

# Verify cache enabled in .memoryrc.json
cat .memoryrc.json | grep cache -A 5
```

---

## 📚 Related Commands

Todos passam pelo core (`bin/forja.mjs`, ADR-0020). Se um comando não está aqui, ele está no
registry — `node bin/forja.mjs` lista todos.

```bash
# Buscar antes de ler: é o primeiro passo da economia de tokens (ADR-0009)
npm run query:universal "auth"

# Montar o pacote de contexto mínimo-suficiente (global | domain | task)
npm run context:smart -- task my-project "payment feature"

# Reindexar a memória — também é o que corrige um índice defasado
npm run sync:universal

# Comprimir memória antiga e recuperar espaço
npm run memory:compress
npm run memory:vacuum

# Medir a economia
npm run token:benchmark

# Índice defasado responde sobre memória velha, calado. O doctor avisa (ADR-0023)
npm run tools:doctor
```

---

**Próximo**: [`docs/agent-harnesses.md`](agent-harnesses.md) — os gates e as ferramentas de processo.
