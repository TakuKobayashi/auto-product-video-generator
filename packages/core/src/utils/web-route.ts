/**
 * Returns true only for a URL path that can be opened as-is. Framework route
 * templates such as `/blog/[slug]`, `/docs/[...parts]`, `/users/:id`, and
 * wildcards describe many pages but are not themselves valid demo targets.
 */
export function isConcreteWebRoute(route: string | undefined): boolean {
  if (!route || !route.startsWith('/')) return false;
  if (/[\[\]*]/.test(route)) return false;
  if (/(?:^|\/):[^/]+/.test(route)) return false;
  return true;
}
