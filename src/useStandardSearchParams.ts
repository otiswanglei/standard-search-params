import { useMemo, useState } from 'react';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

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
 * identity, so pass a stable object (define it outside the component, or
 * memoize it) — an inline schema is fine for the initial read, but changing
 * its identity on a later render won't trigger a re-parse.
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
          if (
            typeof process !== 'undefined' &&
            process.env.NODE_ENV !== 'production'
          ) {
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
