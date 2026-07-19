import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` that gracefully falls back to `useEffect` during
 * server-side rendering, avoiding React's "useLayoutEffect does nothing on
 * the server" warning. Behaves exactly like `useLayoutEffect` in the browser.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
