import { readFile } from 'node:fs/promises';

const releaseVersion = process.env.RELEASE_VERSION;
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseVersion || '')) {
  throw new Error(`Invalid release tag: ${releaseVersion || '(missing)'}`);
}

const expected = releaseVersion.slice(1);
const packageJson = JSON.parse(await readFile('packages/cli/package.json', 'utf8'));
if (packageJson.version !== expected) {
  throw new Error(
    `Tag ${releaseVersion} does not match ${packageJson.name}@${packageJson.version}`
  );
}
