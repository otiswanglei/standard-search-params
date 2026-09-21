import { renderHook } from '@testing-library/react';
import { z } from 'zod';
import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStandardSearchParams } from './useStandardSearchParams';

const setUrl = (search: string) => {
  window.history.pushState({}, '', `/${search}`);
};

describe('useStandardSearchParams', () => {
  afterEach(() => {
    setUrl('');
  });

  it('parses and validates matching params (zod)', () => {
    setUrl('?page=2&q=hello');
    const schema = {
      page: z.coerce.number().int(),
      q: z.string(),
    };

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.isSearchParamsReady).toBe(true);
    expect(result.current.searchParams).toEqual({ page: '2', q: 'hello' });
    expect(result.current.validatedSearchParams).toEqual({
      page: 2,
      q: 'hello',
    });
  });

  it('parses and validates matching params (valibot)', () => {
    setUrl('?page=2&q=hello');
    const schema = {
      page: v.pipe(v.string(), v.transform(Number), v.integer()),
      q: v.string(),
    };

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.searchParams).toEqual({ page: '2', q: 'hello' });
    expect(result.current.validatedSearchParams).toEqual({
      page: 2,
      q: 'hello',
    });
  });

  it('supports mixing schemas from different libraries for different keys', () => {
    setUrl('?page=2&q=hello');
    const schema = {
      page: z.coerce.number().int(),
      q: v.string(),
    };

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.validatedSearchParams).toEqual({
      page: 2,
      q: 'hello',
    });
  });

  it('drops params that fail validation but keeps their raw value', () => {
    setUrl('?page=not-a-number');
    const schema = {
      page: z.coerce.number().int(),
    };

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.searchParams).toEqual({ page: 'not-a-number' });
    expect(result.current.validatedSearchParams).toEqual({});
  });

  it('treats an explicit empty value as present, not missing', () => {
    setUrl('?q=');
    const schema = {
      q: z.string(),
    };

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.searchParams).toEqual({ q: '' });
    expect(result.current.validatedSearchParams).toEqual({ q: '' });
  });

  it('ignores params not present in the schema', () => {
    setUrl('?page=2&unknown=value');
    const schema = {
      page: z.coerce.number().int(),
    };

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.searchParams).toEqual({ page: '2' });
    expect(result.current.validatedSearchParams).toEqual({ page: 2 });
  });

  it('returns empty results when no matching params are present', () => {
    setUrl('');
    const schema = {
      page: z.coerce.number().int(),
    };

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.isSearchParamsReady).toBe(true);
    expect(result.current.searchParams).toEqual({});
    expect(result.current.validatedSearchParams).toEqual({});
  });

  it('ignores inherited (non-own) properties of the schema object', () => {
    setUrl('?page=2&inherited=3');
    const base = Object.create({
      inherited: z.coerce.number().int(),
    });
    const schema: typeof base & { page: z.ZodNumber } = Object.assign(base, {
      page: z.coerce.number().int(),
    });

    const { result } = renderHook(() => useStandardSearchParams(schema));

    expect(result.current.searchParams).toEqual({ page: '2' });
    expect(result.current.validatedSearchParams).toEqual({ page: 2 });
  });

  it('returns a referentially stable result across re-renders once loaded', () => {
    setUrl('?page=2');
    const schema = {
      page: z.coerce.number().int(),
    };

    const { result, rerender } = renderHook(() =>
      useStandardSearchParams(schema),
    );
    const firstResult = result.current;

    rerender();

    expect(result.current).toBe(firstResult);
  });

  describe('dev warning for a changing set of schema keys', () => {
    it('does not warn when a fresh inline schema has the same keys', () => {
      setUrl('?page=2');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { rerender } = renderHook(
        ({ page }) => useStandardSearchParams({ page }),
        { initialProps: { page: z.coerce.number().int() } },
      );
      rerender({ page: z.coerce.number().int() }); // new object, same key
      rerender({ page: z.coerce.number().int() });

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('warns once when the set of schema keys changes after mount', () => {
      setUrl('?page=2&q=hello');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { rerender } = renderHook(
        (schema) => useStandardSearchParams(schema),
        { initialProps: { page: z.coerce.number().int() } as Record<string, z.ZodTypeAny> },
      );

      rerender({ page: z.coerce.number().int(), q: z.string() });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/schema keys changed after mount/);
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/was \[page\], now \[page,q\]/);

      // Re-rendering again with the same (new) keys shouldn't warn again.
      rerender({ page: z.coerce.number().int(), q: z.string() });
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });
  });
});
