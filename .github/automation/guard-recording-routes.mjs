import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const workDir = process.env.APVG_WORK_DIR;
const packageRoot = process.env.APVG_PACKAGE_ROOT;
const configPath = process.env.APVG_CONFIG;
if (!workDir || !packageRoot || !configPath) {
  throw new Error('APVG_WORK_DIR, APVG_PACKAGE_ROOT and APVG_CONFIG are required');
}

const require = createRequire(join(packageRoot, 'package.json'));
const yaml = require('js-yaml');
const config = yaml.load(await readFile(configPath, 'utf8'));
const resolved = await readFile(join(workDir, 'resolved-config.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => ({}));
const baseUrl = new URL(resolved.target?.url || config.target.url);
const startCommand = config.source.startCommand || resolved.source?.startCommand;
const validatedPath = join(workDir, 'validated-web-routes.json');
const serverPidPath = join(workDir, 'validated-web-server.pid');

if (process.argv[2] === '--stop') {
  const pid = await readFile(serverPidPath, 'utf8').then(Number).catch(() => 0);
  if (pid && process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // The server already stopped.
    }
  }
  process.exit(0);
}

if (process.argv[2] === '--summary') {
  const summaryPath = join(workDir, 'project-summary.json');
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  if (summary.platform !== 'web') process.exit(0);

  const context = JSON.parse(await readFile(join(workDir, 'source-context.json'), 'utf8'));
  const logPath = join(workDir, 'dev-server.log');
  await startApp(summary.setupSteps || [], context.rootDir, logPath, baseUrl);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const verified = new Set(['/']);
  try {
    const home = await probe(browser, new URL('/', baseUrl));
    if (!home.ok) throw new Error(`Application home page is not recordable: ${home.reason}`);

    for (const feature of summary.features || []) {
      if (!feature.demoable) continue;
      const url = candidateUrl(feature.route, baseUrl);
      if (!url) {
        reject(feature, 'missing, dynamic, or external URL');
        continue;
      }
      if (url.pathname === '/') {
        verified.add('/');
        continue;
      }
      const result = await probe(browser, url);
      if (!result.ok) {
        reject(feature, result.reason);
        continue;
      }
      if (result.finalPath !== url.pathname) {
        reject(feature, `redirected to ${result.finalPath}`);
        continue;
      }
      if (result.visibleText === home.visibleText) {
        reject(feature, 'rendered the same content as the home page');
        continue;
      }
      verified.add(url.pathname);
    }
  } finally {
    await browser.close();
  }

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(validatedPath, `${JSON.stringify([...verified], null, 2)}\n`, 'utf8');
  console.log(`Runtime-verified recording routes: ${[...verified].join(', ')}`);
  process.exit(0);
}

if (process.argv[2] !== '--scenario') throw new Error('Expected --summary or --scenario');
const scenarioPath = join(workDir, 'scenario.yml');
const scenario = yaml.load(await readFile(scenarioPath, 'utf8'));
if (scenario.meta?.platform !== 'web') process.exit(0);
const verified = new Set(JSON.parse(await readFile(validatedPath, 'utf8')));
for (const scene of scenario.scenes || []) {
  for (const action of scene.actions || []) {
    if (action.type !== 'goto') continue;
    const url = candidateUrl(action.url, baseUrl);
    if (!url || !verified.has(url.pathname)) {
      throw new Error(`Scene '${scene.id}' uses an unverified URL: ${action.url}`);
    }
  }
}
console.log('All scenario navigation URLs were verified against the running application.');

function reject(feature, reason) {
  console.warn(`Excluding '${feature.id}' (${feature.route || 'no route'}): ${reason}`);
  feature.demoable = false;
  delete feature.route;
}

function candidateUrl(route, base) {
  if (!route) return null;
  let url;
  try {
    url = new URL(route, base);
  } catch {
    return null;
  }
  if (url.origin !== base.origin) return null;
  if (/\[|\]|\*|:|\$/.test(url.pathname)) return null;
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url;
}

async function probe(browser, url) {
  const page = await browser.newPage();
  try {
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!response || response.status() >= 400) {
      return { ok: false, reason: `HTTP ${response?.status() || 'no response'}` };
    }
    await page.waitForTimeout(800);
    const finalPath = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
    const visibleText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    return { ok: true, finalPath, visibleText };
  } catch (error) {
    return { ok: false, reason: error.message };
  } finally {
    await page.close();
  }
}

async function startApp(steps, rootDir, logPath, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (response.status < 500) return;
  } catch {
    // Start the application using the analyzed setup plan below.
  }
  const logFd = openSync(logPath, 'a');
  const activeSteps = steps.length
    ? steps
    : [{ name: 'Start application', command: startCommand, background: true }];
  if (!activeSteps.some((step) => step.command)) throw new Error('No application start command was identified');
  for (const step of activeSteps) {
    const cwd = step.cwd ? resolve(rootDir, step.cwd) : rootDir;
    const child = spawn(step.command, {
      cwd,
      shell: true,
      detached: Boolean(step.background),
      stdio: ['ignore', logFd, logFd],
    });
    if (step.background) {
      if (child.pid) await writeFile(serverPidPath, String(child.pid), 'utf8');
      child.unref();
      break;
    }
    const code = await new Promise((done, fail) => {
      child.once('error', fail);
      child.once('exit', done);
    });
    if (code !== 0) throw new Error(`Setup step '${step.name}' failed (${code}); see ${logPath}`);
  }
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Application did not become ready at ${url}; see ${logPath}`);
}
