import { spawn } from 'node:child_process';
import { existsSync, openSync, readdirSync } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { logger } from '@demo-video-gen/core';

export interface AndroidProjectOptions {
  package?: string;
  activity?: string;
  serial?: string;
  avd?: string;
  apkPath?: string;
  buildCommand?: string;
  sdkPath?: string;
  autoStartEmulator?: boolean;
  autoInstall?: boolean;
}

export interface AndroidProjectContext {
  rootDir: string;
  workDir: string;
}

export interface PreparedAndroidTarget {
  package: string;
  activity?: string;
  serial: string;
  adbPath: string;
}

/** Prepares the same basic runtime Android Studio uses for Run: device, APK, install. */
export async function prepareAndroidProject(
  options: AndroidProjectOptions,
  context: AndroidProjectContext,
): Promise<PreparedAndroidTarget> {
  const adbPath = findSdkTool('adb', options.sdkPath);
  const serial = await ensureAndroidDevice(adbPath, options, context.workDir);
  const sourceRoot = context.rootDir;
  const configuredApk = options.apkPath ? resolve(sourceRoot, options.apkPath) : undefined;
  if (configuredApk && !existsSync(configuredApk)) {
    throw new Error(`Configured Android APK does not exist: ${configuredApk}`);
  }

  let apkPath = configuredApk;
  if (!apkPath) {
    const plan = await detectBuildPlan(sourceRoot, options.buildCommand);
    if (plan) {
      logger.step('android:build', `${plan.label}: ${plan.command}`);
      await runShell(plan.command, plan.cwd);
      apkPath = await findNewestApk(sourceRoot);
    } else {
      apkPath = await findNewestApk(sourceRoot);
    }
  }

  if (!apkPath) {
    throw new Error(
      'No Android APK was found and no conventional Gradle/Flutter build could be detected. ' +
      'For Unity or a custom project, set target.android.buildCommand and optionally target.android.apkPath.',
    );
  }
  logger.success(`Android APK: ${apkPath}`);

  // APK metadata is authoritative for debug applicationIdSuffix values;
  // source parsing is only a fallback when Android build-tools are absent.
  const packageName = options.package
    ?? await detectPackageFromApk(apkPath, options.sdkPath)
    ?? await detectPackageFromSource(sourceRoot);
  if (!packageName) {
    throw new Error(
      `Could not detect the Android application id from source or ${apkPath}. ` +
      'Set target.android.package in dvg.config.yaml.',
    );
  }

  if (options.autoInstall !== false) {
    logger.step('android:install', `Installing ${packageName} on ${serial}...`);
    await run(adbPath, ['-s', serial, 'install', '-r', '-t', apkPath]);
  }
  const installed = await run(adbPath, ['-s', serial, 'shell', 'pm', 'path', packageName]);
  if (!installed.trim().startsWith('package:')) {
    throw new Error(`Android package '${packageName}' is not installed on ${serial}.`);
  }
  logger.success(`Android app ready: ${packageName} on ${serial}`);
  return { package: packageName, activity: options.activity, serial, adbPath };
}

interface BuildPlan { label: string; command: string; cwd: string }

async function detectBuildPlan(rootDir: string, override?: string): Promise<BuildPlan | undefined> {
  if (override) return { label: 'Configured build', command: override, cwd: rootDir };
  if (existsSync(join(rootDir, 'pubspec.yaml'))) {
    return { label: 'Flutter debug build', command: 'flutter build apk --debug', cwd: rootDir };
  }
  for (const candidate of [rootDir, join(rootDir, 'android')]) {
    const wrapper = process.platform === 'win32' ? join(candidate, 'gradlew.bat') : join(candidate, 'gradlew');
    if (existsSync(wrapper)) {
      const executable = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
      return { label: 'Gradle debug build', command: `${executable} assembleDebug`, cwd: candidate };
    }
  }
  return undefined;
}

async function ensureAndroidDevice(
  adbPath: string,
  options: AndroidProjectOptions,
  workDir: string,
): Promise<string> {
  await run(adbPath, ['start-server']);
  const connected = await listConnectedDevices(adbPath);
  if (options.serial && connected.includes(options.serial)) {
    await waitForBoot(adbPath, options.serial);
    return options.serial;
  }
  if (!options.serial && connected.length > 0) {
    const emulator = connected.find((serial) => serial.startsWith('emulator-'));
    const selected = emulator ?? connected[0];
    logger.success(`Using connected Android device: ${selected}`);
    await waitForBoot(adbPath, selected);
    return selected;
  }
  if (options.autoStartEmulator === false) {
    throw new Error('No Android device is connected and target.android.autoStartEmulator is false.');
  }

  const emulatorPath = findSdkTool('emulator', options.sdkPath);
  const avds = (await run(emulatorPath, ['-list-avds']))
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const avd = options.avd ?? avds[0];
  if (!avd) {
    throw new Error(
      'No connected Android device and no AVD is installed. Create one in Android Studio Device Manager, ' +
      'or with sdkmanager/avdmanager, then rerun this command.',
    );
  }
  if (!avds.includes(avd)) {
    throw new Error(`Configured AVD '${avd}' was not found. Available AVDs: ${avds.join(', ') || '(none)'}`);
  }

  await mkdir(workDir, { recursive: true });
  const logPath = join(workDir, 'android-emulator.log');
  logger.step('android:emulator', `Starting AVD '${avd}' (logs: ${logPath})...`);
  const logHandle = openSync(logPath, 'a');
  const child = spawn(emulatorPath, [
    '-avd', avd, '-no-boot-anim', '-no-snapshot-save', '-no-audio',
  ], { detached: true, stdio: ['ignore', logHandle, logHandle] });
  child.unref();

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const devices = await listConnectedDevices(adbPath);
    const selected = options.serial && devices.includes(options.serial)
      ? options.serial
      : devices.find((serial) => serial.startsWith('emulator-'));
    if (selected) {
      await waitForBoot(adbPath, selected, Math.max(1, deadline - Date.now()));
      logger.success(`Android emulator ready: ${selected}`);
      return selected;
    }
    await wait(1500);
  }
  throw new Error(`Android emulator '${avd}' did not connect within 240 seconds. Check ${logPath}.`);
}

async function listConnectedDevices(adbPath: string): Promise<string[]> {
  const output = await run(adbPath, ['devices']);
  return output.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && (parts[1] === 'device' || parts[1] === 'offline'))
    .map((parts) => parts[0]);
}

async function waitForBoot(adbPath: string, serial: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const booted = await run(adbPath, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']);
      if (booted.trim() === '1') {
        await run(adbPath, ['-s', serial, 'shell', 'input', 'keyevent', '82']).catch(() => '');
        return;
      }
    } catch { /* device is still transitioning */ }
    await wait(1200);
  }
  throw new Error(`Android device '${serial}' did not finish booting within ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function findNewestApk(rootDir: string): Promise<string | undefined> {
  const matches: Array<{ path: string; mtime: number }> = [];
  const excluded = new Set(['.git', 'node_modules', '.gradle', '.dart_tool']);
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 9) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) await walk(join(dir, entry.name), depth + 1);
      } else if (entry.name.endsWith('.apk') && !/-androidTest|-unaligned/.test(entry.name)) {
        const path = join(dir, entry.name);
        matches.push({ path, mtime: (await stat(path)).mtimeMs });
      }
    }
  }
  await walk(rootDir, 0);
  matches.sort((a, b) => {
    const aDebug = /debug/i.test(a.path) ? 1 : 0;
    const bDebug = /debug/i.test(b.path) ? 1 : 0;
    return bDebug - aDebug || b.mtime - a.mtime;
  });
  return matches[0]?.path;
}

async function detectPackageFromSource(rootDir: string): Promise<string | undefined> {
  const candidates = [
    join(rootDir, 'app', 'build.gradle'), join(rootDir, 'app', 'build.gradle.kts'),
    join(rootDir, 'android', 'app', 'build.gradle'), join(rootDir, 'android', 'app', 'build.gradle.kts'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    const match = text.match(/\bapplicationId\s*(?:=\s*)?["']([^"']+)["']/);
    if (match) return match[1];
  }
  const manifests = [
    join(rootDir, 'app', 'src', 'main', 'AndroidManifest.xml'),
    join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  ];
  for (const path of manifests) {
    if (!existsSync(path)) continue;
    const match = (await readFile(path, 'utf8')).match(/<manifest\b[^>]*\bpackage=["']([^"']+)["']/);
    if (match) return match[1];
  }
  return undefined;
}

async function detectPackageFromApk(apkPath: string, sdkPath?: string): Promise<string | undefined> {
  const aapt = findBuildTool('aapt', sdkPath) ?? findBuildTool('aapt2', sdkPath);
  if (!aapt) return undefined;
  try {
    const output = await run(aapt, ['dump', 'badging', apkPath]);
    return output.match(/^package: name='([^']+)'/m)?.[1];
  } catch { return undefined; }
}

function findBuildTool(name: string, sdkPath?: string): string | undefined {
  for (const sdk of sdkRoots(sdkPath)) {
    const dir = join(sdk, 'build-tools');
    if (!existsSync(dir)) continue;
    try {
      const versions = readdirSync(dir).sort().reverse();
      for (const version of versions) {
        const path = join(dir, version, executableName(name));
        if (existsSync(path)) return path;
      }
    } catch { /* continue */ }
  }
  return undefined;
}

function findSdkTool(name: 'adb' | 'emulator', sdkPath?: string): string {
  const relative = name === 'adb' ? join('platform-tools', executableName(name)) : join('emulator', executableName(name));
  for (const sdk of sdkRoots(sdkPath)) {
    const path = join(sdk, relative);
    if (existsSync(path)) return path;
  }
  return executableName(name);
}

function sdkRoots(configured?: string): string[] {
  return [configured, process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]
    .filter((value): value is string => Boolean(value));
}
function executableName(name: string): string { return process.platform === 'win32' ? `${name}.exe` : name; }

function runShell(command: string, cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`Android build command exited with code ${code}: ${command}`)));
  });
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => reject(new Error(`Could not start ${command}: ${error.message}`)));
    child.on('close', (code) => code === 0
      ? resolvePromise(stdout)
      : reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr.trim()}`)));
  });
}
function wait(ms: number): Promise<void> { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
