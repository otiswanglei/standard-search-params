import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server, to avoid
 * React's SSR warning about `useLayoutEffect` doing nothing on the server.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
