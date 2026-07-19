/**
 * Escape a string so it can be embedded literally inside a `RegExp`.
 *
 * @example
 * new RegExp(escapeRegExp('a.b')); // matches the literal "a.b", not "aXb"
 */
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
