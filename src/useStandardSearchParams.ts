import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

/**
 * A map from URL search param name to the schema that validates it. Each
 * value can come from any validation library that implements the
 * [Standard Schema](https://standardschema.dev) spec — Zod (v3.24+ / v4),
 * Valibot, ArkType, and others.
 */
export type SearchParamsSchema = Record<string, StandardSchemaV1>;

export type InferSearchParams<T extends SearchParamsSchema> = {
  [K in keyof T]: StandardSchemaV1.InferOutput<T[K]>;
};

export interface UseStandardSearchParamsOptions {
  /**
   * Also re-read and re-validate the URL on `popstate` (browser
   * back/forward). `false` by default — this hook otherwise only ever
   * reads the URL once, on mount.
   *
   * `popstate` does not fire for SPA route pushes (`router.push()`,
   * `navigate()`, ...); call the returned `refresh()` from an effect tied
   * to your router's location state to cover that case, regardless of
   * this option.
   */
  listenToPopstate?: boolean;
}

export interface RefreshOptions {
  /**
   * Re-validate even if `location.search` hasn't changed since the last
   * read. Without this, `refresh()` is a no-op when the URL is unchanged
   * — which is what lets a `popstate` listener and your router's own
   * effect both call `refresh()` for the same navigation without
   * re-validating twice. Pass `force: true` when you need to re-validate
   * against the same URL, e.g. after changing a validator's rules at
   * runtime.
   */
  force?: boolean;
}

export interface UseStandardSearchParamsResult<T extends SearchParamsSchema> {
  /** Params that passed validation, parsed to each schema's output type. */
  validatedSearchParams: Partial<InferSearchParams<T>>;
  /** Raw string values read from the URL, before validation. */
  searchParams: Partial<Record<keyof T, string>>;
  /** `true` once the initial read/parse pass has completed on the client. */
  isSearchParamsReady: boolean;
  /**
   * Re-reads and re-validates the current URL. Call this from an effect
   * tied to your router's location state to cover SPA route pushes, which
   * don't fire `popstate`. See {@link RefreshOptions}.
   */
  refresh: (options?: RefreshOptions) => void;
}

type ParsedState<T extends SearchParamsSchema> = Pick<
  UseStandardSearchParamsResult<T>,
  'validatedSearchParams' | 'searchParams' | 'isSearchParamsReady'
>;

/**
 * Reads the current URL's search params and validates each one individually
 * against its own schema.
 *
 * Unlike a single object schema, `schema` here is a plain object mapping
 * each param name to its own Standard Schema validator, so one invalid
 * param never discards the others — it's simply left out of
 * `validatedSearchParams` while still available (as a raw string) in
 * `searchParams`.
 *
 * The URL is read once, on mount, by default. It does not re-run just
 * because `schema` changes identity — an inline schema literal (a fresh
 * object every render) is fine, since only the very first render's keys
 * are ever read. If the *set of keys* genuinely needs to change at
 * runtime (e.g. a permission-dependent schema), memoizing the object
 * won't help — remount the component instead (e.g. with a `key` prop). A
 * console warning flags this in development if the schema's keys differ
 * from what was there on mount.
 *
 * Pass `{ listenToPopstate: true }` to also re-read automatically on
 * browser back/forward. For SPA route pushes, call the returned
 * `refresh()` from an effect tied to your router's location state.
 *
 * Only synchronous validators are supported: if a schema's `validate`
 * returns a `Promise`, that param is treated as invalid (with a console
 * warning in development).
 */
export const useStandardSearchParams = <T extends SearchParamsSchema>(
  schema: T,
  options?: UseStandardSearchParamsOptions,
): UseStandardSearchParamsResult<T> => {
  const [state, setState] = useState<ParsedState<T>>({
    validatedSearchParams: {},
    searchParams: {},
    isSearchParamsReady: false,
  });

  // Dev-only: warn if the set of schema keys changes after mount. This
  // never affects behavior — the hook still only reads the URL once, on
  // mount — it just flags a likely footgun (e.g. a permission-dependent
  // schema) early instead of silently ignoring newly-added keys.
  const schemaKeys = Object.keys(schema).sort().join(',');
  const prevSchemaKeysRef = useRef(schemaKeys);
  useEffect(() => {
    if (isDev && prevSchemaKeysRef.current !== schemaKeys) {
      console.warn(
        `useStandardSearchParams: schema keys changed after mount (was [${prevSchemaKeysRef.current}], now [${schemaKeys}]), but this hook only reads the URL once, on mount, so the new keys won't be read. If the set of keys genuinely needs to change at runtime, remount the component (e.g. with a \`key\` prop) — memoizing the schema object does not cause a re-parse.`,
      );
      prevSchemaKeysRef.current = schemaKeys;
    }
  }, [schemaKeys]);

  // Always read the latest schema from parse() without making parse's own
  // identity depend on it — parse must stay referentially stable so it's
  // safe to put in a consumer's effect dependency array (as `refresh`) and
  // to add/remove as a popstate listener without re-subscribing every
  // render.
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  // The last `location.search` a parse actually ran for. Lets a popstate
  // listener and a consumer's own refresh() both fire for the same
  // navigation without re-validating twice.
  const lastSearchRef = useRef<string | null>(null);

  const parse = useCallback((refreshOptions?: RefreshOptions) => {
    if (typeof window === 'undefined') return;

    const currentSearch = window.location.search;
    if (!refreshOptions?.force && lastSearchRef.current === currentSearch) {
      return;
    }
    lastSearchRef.current = currentSearch;

    const currentSchema = schemaRef.current;

    // Built up as plain, loosely-typed objects and cast once at the
    // setState boundary below — mutating in place (rather than spreading
    // a new object on every key) keeps this a single pass over the
    // schema's keys.
    const validatedParams: Record<string, unknown> = {};
    const params: Record<string, string> = {};
    const urlSearchParams = new URLSearchParams(currentSearch);

    for (const paramKey of Object.keys(currentSchema)) {
      const paramValue = urlSearchParams.get(paramKey);
      const fieldSchema = currentSchema[paramKey];
      if (paramValue !== null && fieldSchema) {
        params[paramKey] = paramValue;

        const result = fieldSchema['~standard'].validate(paramValue);

        if (result instanceof Promise) {
          if (isDev) {
            console.warn(
              `useStandardSearchParams: schema for "${paramKey}" returned an async validation result, which is not supported. This param will be treated as invalid.`,
            );
          }
          continue;
        }

        if (!result.issues) {
          validatedParams[paramKey] = result.value;
        }
      }
    }

    setState({
      validatedSearchParams: validatedParams as Partial<InferSearchParams<T>>,
      searchParams: params as Partial<Record<keyof T, string>>,
      isSearchParamsReady: true,
    });
  }, []);

  // Mount-only initial read. `parse` never changes identity, so in
  // practice this runs exactly once, matching the documented "reads the
  // URL once, on mount" behavior regardless of the popstate option below.
  useIsomorphicLayoutEffect(() => {
    parse();
  }, [parse]);

  // Optional, separate from the mount-time read: attach/detach a
  // `popstate` listener as `listenToPopstate` changes. A listener call
  // never forces re-validation (no `force`), so it's deduped against
  // whatever a consumer's own `refresh()` already handled for the same
  // navigation.
  useEffect(() => {
    if (!options?.listenToPopstate) return;

    const handlePopstate = () => parse();
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [parse, options?.listenToPopstate]);

  return useMemo(() => ({ ...state, refresh: parse }), [state, parse]);
};
