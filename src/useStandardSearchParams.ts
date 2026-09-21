import { useEffect, useMemo, useRef, useState } from 'react';
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

export interface UseStandardSearchParamsResult<T extends SearchParamsSchema> {
  /** Params that passed validation, parsed to each schema's output type. */
  validatedSearchParams: Partial<InferSearchParams<T>>;
  /** Raw string values read from the URL, before validation. */
  searchParams: Partial<Record<keyof T, string>>;
  /** `true` once the initial read/parse pass has completed on the client. */
  isSearchParamsReady: boolean;
}

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
 * The URL is read once, on mount. It does not re-run when `schema` changes
 * — an inline schema literal (a fresh object every render) is fine, since
 * only the very first render's keys are ever read. If the *set of keys*
 * genuinely needs to change at runtime (e.g. a permission-dependent
 * schema), memoizing the object won't help — remount the component
 * instead (e.g. with a `key` prop). A console warning flags this in
 * development if the schema's keys differ from what was there on mount.
 *
 * Only synchronous validators are supported: if a schema's `validate`
 * returns a `Promise`, that param is treated as invalid (with a console
 * warning in development).
 */
export const useStandardSearchParams = <T extends SearchParamsSchema>(
  schema: T,
): UseStandardSearchParamsResult<T> => {
  const [validatedSearchParams, setValidatedSearchParams] = useState<
    Partial<InferSearchParams<T>>
  >({});
  const [searchParams, setSearchParams] = useState<
    Partial<Record<keyof T, string>>
  >({});
  const [isSearchParamsReady, setIsSearchParamsReady] = useState(false);

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

  useIsomorphicLayoutEffect(() => {
    // Built up as plain, loosely-typed objects and cast once at the state
    // boundary below — mutating in place (rather than spreading a new
    // object on every key) keeps this a single pass over `schema`'s keys.
    const validatedParams: Record<string, unknown> = {};
    const params: Record<string, string> = {};
    const urlSearchParams = new URLSearchParams(window.location.search);

    for (const paramKey of Object.keys(schema)) {
      const paramValue = urlSearchParams.get(paramKey);
      const fieldSchema = schema[paramKey];
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

    setValidatedSearchParams(validatedParams as Partial<InferSearchParams<T>>);
    setSearchParams(params as Partial<Record<keyof T, string>>);
    setIsSearchParamsReady(true);
  }, []);

  return useMemo(
    () => ({
      validatedSearchParams,
      searchParams,
      isSearchParamsReady,
    }),
    [validatedSearchParams, searchParams, isSearchParamsReady],
  );
};
