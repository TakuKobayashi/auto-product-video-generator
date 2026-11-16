/** Add the conventional clone suffix to remote URLs, leaving local paths alone. */
export function normalizeRepositoryUrl(repository: string): string {
  const value = repository.trim();
  // Keep credentials, ports and query parameters exactly as supplied. Browser
  // fragments are not part of the repository address.
  const url = value.match(/^((?:https?|ssh|git):\/\/[^/?#]+)(\/[^?#]*)(\?[^#]*)?(?:#.*)?$/i);
  if (url) {
    const path = url[2].replace(/\/+$/, '');
    if (!path) return value;
    return `${url[1]}${path.endsWith('.git') ? path : `${path}.git`}${url[3] || ''}`;
  }

  // SCP-style SSH remotes, including SSH config host aliases. Exclude Windows
  // drive paths so that local clones retain their existing behavior.
  const scp = value.match(/^((?:[^@/:\s]+@)?[^/:\s]+:)([^\s]+)$/);
  if (scp && !value.includes('://') && !/^[a-z]:/i.test(value) && !scp[2].startsWith('\\')) {
    const path = scp[2].replace(/\/+$/, '');
    if (path) return `${scp[1]}${path.endsWith('.git') ? path : `${path}.git`}`;
  }
  return value;
}
