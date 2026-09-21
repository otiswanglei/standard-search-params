# @standard-search-params/react

A tiny **client-side** React hook that reads the current URL's search params
and validates each one, key by key, against **any validation library that
implements [Standard Schema](https://standardschema.dev)** — [Zod](https://zod.dev)
(v3.24+ or v4), [Valibot](https://valibot.dev), [ArkType](https://arktype.io),
and others. One invalid param never throws away the rest.

Built for client-rendered apps (SPAs) and client components — it reads
`window.location.search` after mount, so it never runs during server
rendering. See [Behavior & limitations](#behavior--limitations) for what
that means in an SSR framework.

## Install

```bash
npm install @standard-search-params/react
```

`react` (>=16.8) is the only peer dependency. Bring whichever Standard
Schema-compliant validation library you like — the hook doesn't depend on
any of them directly.

## Usage

Instead of one big object schema, pass a plain object mapping each param
name to **its own** schema. The example below uses Zod, but any Standard
Schema library works exactly the same way — see
[Mixing validation libraries](#mixing-validation-libraries) for a Valibot
example:

```tsx
import { z } from 'zod';
import { useStandardSearchParams } from '@standard-search-params/react';

const schema = {
  page: z.coerce.number().int().min(1),
  q: z.string().min(1),
};

function SearchResults() {
  const { validatedSearchParams, searchParams, isSearchParamsReady } =
    useStandardSearchParams(schema);

  if (!isSearchParamsReady) return null;

  // validatedSearchParams.page is `number | undefined`, already parsed.
  return <div>page: {validatedSearchParams.page ?? 1}</div>;
}
```

Given a URL like `?page=2&q=hello&sort=bad`, where `schema` has no `sort`
key:

```ts
searchParams          // { page: '2', q: 'hello' }          (raw strings)
validatedSearchParams // { page: 2, q: 'hello' }             (parsed)
```

If `page` were `?page=abc` (fails `z.coerce.number()`), it would still show
up in `searchParams.page` as `'abc'`, but be omitted from
`validatedSearchParams`.

### Mixing validation libraries

Because each key just needs to be a Standard Schema, you can even mix
libraries per field:

```tsx
import { z } from 'zod';
import * as v from 'valibot';
import { useStandardSearchParams } from '@standard-search-params/react';

const schema = {
  page: z.coerce.number().int(),
  q: v.pipe(v.string(), v.minLength(1)),
};

const { validatedSearchParams } = useStandardSearchParams(schema);
```

### Skipping validation for a key

`schema` can't be omitted — it's how the hook knows which URL keys to read
in the first place. But if you want a specific key's raw string passed
through as-is, without any real validation, give it an always-succeeding
schema like `z.any()` (or Valibot's `v.any()`):

```tsx
const schema = {
  page: z.coerce.number().int(), // validated
  debug: z.any(), // passed through as-is
};

const { validatedSearchParams } = useStandardSearchParams(schema);
// validatedSearchParams.debug is whatever string was in the URL, unchanged
```

If you want *every* URL param, validated or not, this hook isn't the
right tool — reach for `URLSearchParams` directly, or your router's own
`useSearchParams()` (React Router, Next.js).

## API

### `useStandardSearchParams(schema)`

- `schema` — a plain object whose values are Standard Schema validators
  (e.g. `z.string()`, `v.number()`). Only these keys are read from the URL.

Returns:

| Field                   | Type                                     | Description                                                          |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `validatedSearchParams` | `Partial<InferSearchParams<typeof schema>>` | Params that passed validation, parsed to each schema's output type. |
| `searchParams`          | `Partial<Record<keyof schema, string>>`   | Raw string values read from the URL, before validation.              |
| `isSearchParamsReady`  | `boolean`                                 | `true` once the initial read/parse pass has completed on the client.  |

`InferSearchParams<T>` is also exported, for when you need the parsed shape
outside the hook:

```ts
import type { InferSearchParams } from '@standard-search-params/react';

type Params = InferSearchParams<typeof schema>;
// { page: number; q: string }
```

## Behavior & limitations

- **Reads the URL once, on mount.** It does not subscribe to
  `popstate`/history changes, and it does not re-run if `schema` changes on
  a later render — an inline schema literal (a fresh object every render)
  is fine, since only the keys present on the very first render are ever
  read. If the *set of keys* genuinely needs to change at runtime (e.g. a
  permission-dependent schema), memoizing the object won't help — remount
  the component instead (e.g. with a `key` prop). In development, a
  console warning flags it if the schema's keys differ from what was
  there on mount.
- **Per-field validation only.** Each key is validated independently, so
  checks that span multiple fields (e.g. a schema-level `.refine()` on a
  composed object) don't apply here — there's no single "object schema" in
  this API, only one schema per field.
- **Synchronous validators only.** If a schema's `~standard.validate()`
  returns a `Promise` (some libraries support async refinements), that
  field is treated as invalid and a warning is logged in development. This
  keeps the hook safe to run inside `useLayoutEffect` without an async gap.
- **Client-side only, by design.** This hook reads `window.location.search`
  and does all its work inside an effect, which never runs during server
  rendering — so it cannot produce validated params as part of the
  server-rendered HTML. It's safe to render inside an SSR framework (no
  crash, no hydration mismatch: `isSearchParamsReady` stays `false`
  through the server render and the first client render, then flips to
  `true` once the client reads and validates the URL), but there's
  necessarily a brief "not loaded yet" moment before that. If you need
  validated search params as part of the initial server-rendered output
  (e.g. a Next.js Server Component, which receives `searchParams` as a
  plain prop), validate that object directly with your schema instead —
  hooks can't run in Server Components at all. This hook is meant for
  client-rendered apps (SPAs) or client components that read params after
  mount.

## Why per-field schemas instead of one object schema?

Two reasons:

1. **Isolation.** Parsing the whole query string against one schema means a
   single invalid or missing field fails validation for everything. This
   hook validates field-by-field, so a malformed `sort` param doesn't also
   blank out a perfectly valid `page` param.
2. **Portability.** Standard Schema doesn't define a library-agnostic way to
   pull one field's schema out of a composed object schema — that's
   `.pick()` in Zod, `.entries` in Valibot, something else in ArkType. By
   asking for a plain `{ key: schema }` map instead, the hook never needs to
   reach into a library's internals, so it works the same way regardless of
   which validators you use.

## Examples

[`examples/basic`](examples/basic) is a small runnable Vite + React app that
mixes Zod and Valibot in the same schema and shows `searchParams` vs.
`validatedSearchParams` live, with links to try invalid, missing, and
empty-string params. To run it:

```bash
npm run build          # build this package first — the example depends on dist/
cd examples/basic
npm install
npm run dev
```

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
