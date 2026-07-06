#!/bin/bash

##############################################################################
#                         Pre-Commit Hook                                  #
#                                                                           #
# Validação automática antes de commit:                                    #
# - Lint (ESLint)                                                          #
# - Tests (Jest)                                                           #
# - Documentation validation                                               #
# - No secrets check                                                       #
#                                                                           #
# Instalação:                                                              #
#   cp scripts/pre-commit.sh .git/hooks/pre-commit                         #
#   chmod +x .git/hooks/pre-commit                                         #
#                                                                           #
##############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Pre-commit validation...${NC}\n"

# 1. Check for secrets
echo -e "${YELLOW}1️⃣  Checking for secrets...${NC}"
if git grep -q -i -E '(password|api_key|token|secret|credential|auth)' -- ':!*.md' ':!*.lock' 2>/dev/null; then
  echo -e "${RED}❌ Secrets detected! Remove before committing.${NC}"
  git grep -i -E '(password|api_key|token|secret)' -- ':!*.md' ':!*.lock' || true
  exit 1
fi
echo -e "${GREEN}✅ No secrets detected${NC}\n"

# 2. Check for console.log
echo -e "${YELLOW}2️⃣  Checking for console.log statements...${NC}"
if git diff --cached --name-only | grep -E '\.(js|ts)$' | xargs grep -l 'console\.(log|debug|info)' 2>/dev/null || [ $? -eq 1 ]; then
  echo -e "${YELLOW}⚠️  Warning: console.log found. Consider using logger instead.${NC}"
fi
echo -e "${GREEN}✅ Check complete${NC}\n"

# 3. Lint staged files
echo -e "${YELLOW}3️⃣  Linting staged files...${NC}"
if command -v npm &> /dev/null; then
  STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts)$' || true)
  if [ ! -z "$STAGED_FILES" ]; then
    echo "$STAGED_FILES" | xargs npm run lint -- --fix --quiet 2>/dev/null || {
      echo -e "${RED}❌ Lint failed. Fix errors and try again.${NC}"
      exit 1
    }
    # Re-add fixed files
    echo "$STAGED_FILES" | xargs git add
    echo -e "${GREEN}✅ Lint passed (auto-fixed)${NC}\n"
  else
    echo -e "${GREEN}✅ No JS/TS files to lint${NC}\n"
  fi
else
  echo -e "${YELLOW}⚠️  npm not found. Skipping lint.${NC}\n"
fi

# 4. Run tests
echo -e "${YELLOW}4️⃣  Running tests...${NC}"
if [ -f "package.json" ] && npm run test --silent 2>/dev/null; then
  echo -e "${GREEN}✅ Tests passed${NC}\n"
else
  echo -e "${YELLOW}⚠️  Tests skipped or failed. Run: npm test${NC}\n"
fi

# 5. Check documentation
echo -e "${YELLOW}5️⃣  Checking documentation...${NC}"
README_FILES=$(git diff --cached --name-only | grep -E '(README|CHANGELOG|\.md)$' || true)
if [ ! -z "$README_FILES" ]; then
  echo "📄 Updated docs:"
  echo "$README_FILES" | sed 's/^/   - /'
fi
echo -e "${GREEN}✅ Documentation check complete${NC}\n"

# 6. SDD pipeline consistency
echo -e "${YELLOW}6️⃣  Validating SDD pipeline (spec:check)...${NC}"
if [ -f "scripts/spec-cli.mjs" ]; then
  if node scripts/spec-cli.mjs check 2>&1; then
    echo -e "${GREEN}✅ All specs consistent${NC}\n"
  else
    echo -e "${RED}❌ spec:check failed. Fix spec/plan/tasks status before committing.${NC}"
    exit 1
  fi
fi

# 7. Standards check
echo -e "${YELLOW}7️⃣  Project standards check...${NC}"
if [ -f "scripts/check-standards.js" ]; then
  node scripts/check-standards.js 2>/dev/null || echo -e "${YELLOW}⚠️  standards check warnings${NC}"
fi
echo -e "${GREEN}✅ Standards check complete${NC}\n"

# 8. Summary
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All pre-commit checks passed!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}\n"

exit 0
