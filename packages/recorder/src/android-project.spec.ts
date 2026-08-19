import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareAndroidProject } from './android-project.js';

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('prepareAndroidProject', () => {
  const posixTest = process.platform === 'win32' ? it.skip : it;

  posixTest(
    'builds a debug APK, detects its package, and installs it on a connected emulator',
    async () => {
      const temp = await mkdtemp(join(tmpdir(), 'apvg-android-spec-'));
      temporaryPaths.push(temp);
      const sdk = join(temp, 'sdk');
      const project = join(temp, 'project');
      const workDir = join(temp, 'work');
      await mkdir(join(sdk, 'platform-tools'), { recursive: true });
      await mkdir(join(sdk, 'build-tools', '35.0.0'), { recursive: true });
      await mkdir(project, { recursive: true });

      const adb = join(sdk, 'platform-tools', 'adb');
      await executable(
        adb,
        `#!/bin/sh
case "$*" in
  "devices") printf 'List of devices attached\\nemulator-5554\\tdevice\\n' ;;
  *"getprop sys.boot_completed"*) echo 1 ;;
  *"pm path com.example.demo"*) echo package:/data/app/com.example.demo/base.apk ;;
  *) exit 0 ;;
esac
`
      );
      const aapt = join(sdk, 'build-tools', '35.0.0', 'aapt');
      await executable(
        aapt,
        "#!/bin/sh\necho \"package: name='com.example.demo' versionCode='1'\"\n"
      );
      await executable(
        join(project, 'gradlew'),
        `#!/bin/sh
mkdir -p app/build/outputs/apk/debug
printf apk > app/build/outputs/apk/debug/app-debug.apk
`
      );
      const result = await prepareAndroidProject({ sdkPath: sdk }, { rootDir: project, workDir });

      expect(result.package).toBe('com.example.demo');
      expect(result.serial).toBe('emulator-5554');
      expect(existsSync(join(project, 'app/build/outputs/apk/debug/app-debug.apk'))).toBe(true);
    }
  );
});

async function executable(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8');
  await chmod(path, 0o755);
}
