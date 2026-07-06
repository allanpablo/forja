# Shared Utils

Common utilities and helpers used across frontend and backend applications.

## Features
- Validation utilities
- Constants
- Helper functions
- Date utilities
- String manipulation

## Directory Structure
```
src/
├── validators/    # Validation functions
├── constants/     # Shared constants
└── utils/         # Helper functions
```

## Usage

### From Frontend
```typescript
import { validateEmail, formatPrice } from '@monorepo/shared-utils';
```

### From Backend
```typescript
import { validateEmail, slugify } from '@monorepo/shared-utils';
```
