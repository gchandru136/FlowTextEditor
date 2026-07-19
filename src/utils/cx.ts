export type ClassValue = string | false | null | undefined;

/**
 * Tiny, dependency-free className combiner. Filters out falsy values and
 * joins the rest with a single space.
 *
 * @example
 * cx('toolbar', isActive && 'toolbar--active', undefined); // 'toolbar toolbar--active'
 */
export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(' ');
