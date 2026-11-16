import { describe, expect, it } from 'vitest';
import { normalizeRepositoryUrl } from './repository-url.js';

describe('normalizeRepositoryUrl', () => {
  it.each([
    ['https://github.com/owner/repo', 'https://github.com/owner/repo.git'],
    [' https://github.com/owner/repo/ ', 'https://github.com/owner/repo.git'],
    ['https://github.com/owner/repo#readme', 'https://github.com/owner/repo.git'],
    ['https://gitlab.com/group/subgroup/repo', 'https://gitlab.com/group/subgroup/repo.git'],
    ['https://git.example.com/group/repo', 'https://git.example.com/group/repo.git'],
    ['https://bitbucket.org/team/repo', 'https://bitbucket.org/team/repo.git'],
    ['git@github.com:owner/repo', 'git@github.com:owner/repo.git'],
    ['git@gitlab.com:group/subgroup/repo/', 'git@gitlab.com:group/subgroup/repo.git'],
    ['work-git:group/repo', 'work-git:group/repo.git'],
    ['ssh://git@git.example.com:2222/group/repo', 'ssh://git@git.example.com:2222/group/repo.git'],
    ['git://git.example.com/repo', 'git://git.example.com/repo.git'],
    ['http://git.example.com/repo/', 'http://git.example.com/repo.git'],
    [
      'https://user:token@git.example.com:8443/a%20b/repo?key=value',
      'https://user:token@git.example.com:8443/a%20b/repo.git?key=value',
    ],
    ['https://github.com/owner/repo.git', 'https://github.com/owner/repo.git'],
    ['https://github.com/owner/repo.git/', 'https://github.com/owner/repo.git'],
    ['git@github.com:owner/repo.git', 'git@github.com:owner/repo.git'],
    ['ssh://git@git.example.com/repo.git', 'ssh://git@git.example.com/repo.git'],
    ['../local-repo', '../local-repo'],
    ['/tmp/local-repo', '/tmp/local-repo'],
    ['C:\\projects\\repo', 'C:\\projects\\repo'],
    ['C:/projects/repo', 'C:/projects/repo'],
    ['file:///tmp/repo', 'file:///tmp/repo'],
    ['https://github.com/', 'https://github.com/'],
  ])('converts %s to %s', (input, expected) => {
    expect(normalizeRepositoryUrl(input)).toBe(expected);
  });
});
