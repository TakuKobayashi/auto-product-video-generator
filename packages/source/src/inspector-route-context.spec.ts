import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { inspectProject } from './inspector.js';

describe('framework-independent routing context', () => {
  it('passes route source evidence to the analyzer without claiming the route is verified', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'apvg-route-context-'));
    await mkdir(join(rootDir, 'config'), { recursive: true });
    await writeFile(join(rootDir, 'config', 'routes.rb'), "get '/schools', to: 'schools#index'");

    const context = await inspectProject(rootDir);

    expect(context.routes).toEqual([]);
    expect(context.routeSourceExcerpt).toContain("get '/schools'");
  });
});
