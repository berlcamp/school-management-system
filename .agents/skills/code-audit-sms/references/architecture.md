# Architecture Reference

## Project Structure Conventions

```
app/
├── (protected)/          # Staff app — requires Supabase auth via AuthGuard
│   ├── <module>/
│   │   ├── page.tsx      # Page component (default export)
│   │   ├── components/   # Module-specific components (co-located)
│   │   └── layout.tsx    # Optional layout
├── (public)/             # Auth, login, public requests
├── (landing)/            # Public-facing school/learner browse
└── student-portal/       # Student app — JWT cookie auth
hooks/                    # Custom React hooks
lib/
├── supabase/             # client.ts, server.ts, admin.ts, middleware.ts
├── redux/                # store.ts, userSlice.ts, listSlice.ts, providers.tsx
├── utils/                # Shared utilities
├── pdf/                  # jsPDF generators
└── constants/            # App-wide constants
components/               # Global shared components
├── ui/                   # shadcn/Radix primitives (DO NOT MODIFY — generated)
├── dashboards/           # Role-specific dashboard components
└── ...
types/                    # database.ts, index.ts
supabase/migrations/      # SQL migration files (numbered sequentially)
```

## Server vs Client Component Rules

### Server Components (default in App Router)
- Can access server-only resources (env vars, `lib/supabase/server.ts`)
- Cannot use hooks, event listeners, browser APIs
- Should be used for data fetching when possible

### Client Components (`"use client"` directive)
- Required for: hooks, event handlers, browser APIs, Redux, `useRouter`
- Use `lib/supabase/client.ts` for Supabase queries
- Must NOT import `lib/supabase/admin.ts` or server-only modules

### Common Mistake
Importing server utilities in a client component will cause a build error or runtime failure.

## Redux Architecture

- `userSlice`: Stores authenticated user info (id, type, school_id, email)
- `listSlice`: Generic cache for paginated list data

Usage pattern:
```typescript
const user = useAppSelector((state) => state.user)
const dispatch = useAppDispatch()
dispatch(addList(data)) // cache list results
```

Always reset list cache (`dispatch(addList([]))`) when filters change to prevent stale data.

## Schema Mismatch — Critical

```typescript
// lib/supabase/server.ts (WRONG for SMS tables)
createServerClient(url, key, { db: { schema: 'public' } })

// lib/supabase/client.ts (correct)
createBrowserClient(url, key, { db: { schema: 'procurements' } })

// lib/supabase/admin.ts (correct, bypasses RLS)
createClient(url, serviceKey, { db: { schema: 'procurements' } })
```

If you write a server action and use `createClient` from `lib/supabase/server.ts`, you'll query the `public` schema. All SMS tables (`sms_*`) live in `procurements`. The query will return nothing or error.

**Fix**: Either use the admin client for server actions, or override the schema explicitly:
```typescript
const supabase = await createServerClient()
// Override: use .schema('procurements') or switch to admin client
```

## File Size Guidelines

| Type | Suggested Max |
|------|---------------|
| Page component | 150 lines |
| Feature component | 200 lines |
| Utility/helper | 100 lines |
| Hook | 80 lines |
| Type definition file | 300 lines |

Files exceeding these limits are candidates for extraction into smaller, focused components or hooks.

## Naming Conventions

- Pages: `page.tsx` (Next.js convention)
- Layouts: `layout.tsx`
- Components: PascalCase (`EnrollmentWizard.tsx`)
- Hooks: camelCase with `use` prefix (`useSchoolSettings.ts`)
- Utilities: camelCase (`getCurrentSchoolYear.ts`)
- Types: PascalCase interfaces (`EnrollmentStatus`, `StudentEntryMode`)

## Co-location Rule

Page-specific components MUST live in a `components/` subfolder next to the page:

```
enrollment/
├── page.tsx
├── Filter.tsx           ← OK (simple, directly used by page)
├── AddModal.tsx         ← OK
└── components/          ← complex/multi-step components go here
    ├── EnrollmentWizard.tsx
    └── EnrollmentDetailsStep.tsx
```

Global/reusable components go in `components/` at the root. If you find a component in `lib/` or a utility in `components/`, that's misplacement.
