# Supabase TypeScript Type Generation

## Overview
Generate type-safe TypeScript definitions from your Supabase database schema to ensure compile-time safety across all database operations.

## Setup

### 1. Install Supabase CLI
```bash
npm install --save-dev supabase
```

### 2. Generate Types
Run this command to generate types from your live database:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/supabase.ts
```

**Alternative:** Generate from local migrations (if using local development):
```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

### 3. File Location
**Recommended structure:**
```
project/
├── src/
│   └── types/
│       └── supabase.ts          # Generated types
│   └── lib/
│       └── supabase-client.ts   # Typed client instance
```

## Usage Examples

### Basic Client Setup
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/supabase';

export const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
```

### Type-Safe Queries
```typescript
import type { Database } from './types/supabase';

// Table row type
type Project = Database['public']['Tables']['projects']['Row'];
type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
type ProjectUpdate = Database['public']['Tables']['projects']['Update'];

// Query with full type inference
const { data, error } = await supabase
  .from('projects')
  .select('id, name, owner_id')
  .eq('status', 'active')
  .maybeSingle();
// data is typed as Project | null

// Insert with type checking
const newProject: ProjectInsert = {
  name: 'My Project',
  owner_id: userId,
  status: 'draft'
};
await supabase.from('projects').insert(newProject);
```

### Function Return Types
```typescript
type TranslationJob = Database['public']['Tables']['translation_jobs']['Row'];

async function fetchPendingJobs(): Promise<TranslationJob[]> {
  const { data, error } = await supabase
    .from('translation_jobs')
    .select('*')
    .eq('status', 'pending');

  if (error) throw error;
  return data || [];
}
```

## Regeneration Workflow

**After schema changes:**
1. Apply migration: `npx supabase db push` (or deploy via MCP tool)
2. Regenerate types: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/supabase.ts`
3. Fix any TypeScript errors in your application code

**Tip:** Add to `package.json` scripts:
```json
{
  "scripts": {
    "types:generate": "supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/supabase.ts"
  }
}
```

## Safety Benefits

✓ **Compile-time column validation** - Typos in column names caught before runtime
✓ **Type-safe inserts/updates** - Only valid fields and types accepted
✓ **Autocomplete** - IDE suggestions for all tables, columns, and relationships
✓ **Refactoring safety** - Rename columns in DB, TypeScript errors guide you to update code
✓ **Enum validation** - Database enums become TypeScript unions

## Notes

- **Generated file is read-only**: Never edit `supabase.ts` manually
- **Commit to version control**: Check in generated types so team stays in sync
- **CI/CD**: Consider generating types in CI to verify schema compatibility
