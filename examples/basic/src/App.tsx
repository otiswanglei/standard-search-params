import { z } from 'zod';
import * as v from 'valibot';
import { useStandardSearchParams } from '@standard-search-params/react';

// `page` is validated with Zod, `q` with Valibot — mixed in the same
// schema, to demonstrate that any Standard Schema library works.
const schema = {
  page: z.coerce.number().int().min(1),
  q: v.pipe(v.string(), v.minLength(1)),
};

const exampleLinks = [
  { label: 'Valid params', href: '?page=2&q=react' },
  { label: 'Invalid page (not a number)', href: '?page=abc&q=react' },
  { label: 'Empty q (present but blank)', href: '?page=1&q=' },
  { label: 'Missing params', href: '?' },
  { label: 'Unknown extra param (sort is not in the schema)', href: '?page=1&q=react&sort=desc' },
];

export function App() {
  const { validatedSearchParams, searchParams, isSearchParamsReady } =
    useStandardSearchParams(schema);

  return (
    <main
      style={{
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", sans-serif',
        maxWidth: 720,
        margin: '2rem auto',
        padding: '0 1rem',
        lineHeight: 1.5,
      }}
    >
      <h1>@standard-search-params/react</h1>
      <p>
        Current URL: <code>{window.location.pathname + window.location.search}</code>
      </p>
      <p>
        <code>page</code> is validated with <strong>Zod</strong>,{' '}
        <code>q</code> with <strong>Valibot</strong> — mixed in the same
        schema object.
      </p>

      <h2>Try it</h2>
      <p>
        These are plain <code>&lt;a&gt;</code> links, so each click is a full
        page load — just like a fresh visit. The hook only reads the URL
        once, on mount, so this is the honest way to see it react to
        different URLs.
      </p>
      <ul>
        {exampleLinks.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a> — <code>{link.href}</code>
          </li>
        ))}
      </ul>

      <h2>Result</h2>
      <dl>
        <dt>
          <code>isSearchParamsReady</code>
        </dt>
        <dd>
          <code>{String(isSearchParamsReady)}</code>
        </dd>

        <dt>
          <code>searchParams</code> (raw strings, before validation)
        </dt>
        <dd>
          <pre>{JSON.stringify(searchParams, null, 2)}</pre>
        </dd>

        <dt>
          <code>validatedSearchParams</code> (parsed, only the valid ones)
        </dt>
        <dd>
          <pre>{JSON.stringify(validatedSearchParams, null, 2)}</pre>
        </dd>
      </dl>
    </main>
  );
}
