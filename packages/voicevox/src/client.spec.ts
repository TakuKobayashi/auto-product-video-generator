import { describe, expect, it } from 'vitest';
import { resolveCredential, resolveVoiceProfiles } from './client.js';

describe('resolveCredential', () => {
  it('expands dotenv-style placeholders without changing literal credentials', () => {
    process.env.AITALK_TEST_USER = 'api-user';
    expect(resolveCredential('${AITALK_TEST_USER}', 'UNUSED')).toBe('api-user');
    expect(resolveCredential('literal-secret', 'UNUSED')).toBe('literal-secret');
    delete process.env.AITALK_TEST_USER;
  });

  it('uses the legacy environment-variable name when a value is omitted', () => {
    process.env.AITALK_TEST_PASSWORD = 'api-password';
    expect(resolveCredential(undefined, 'AITALK_TEST_PASSWORD')).toBe('api-password');
    delete process.env.AITALK_TEST_PASSWORD;
  });
});

describe('resolveVoiceProfiles', () => {
  it('uses configured profiles in their declared order', () => {
    const profiles = [
      { type: 'voicevox' as const, url: 'http://localhost:50021', speakerId: 1 },
      {
        type: 'aitalk' as const,
        url: 'https://webapi.aitalk.jp/webapi/v5/ttsget.php',
        speakerName: 'nozomi',
        usernameEnv: 'AITALK_USERNAME',
        passwordEnv: 'AITALK_PASSWORD',
      },
    ];
    expect(resolveVoiceProfiles({ profiles }, { host: 'http://legacy', speakerId: 3 })).toBe(
      profiles
    );
  });

  it('converts the legacy voicevox setting into one profile', () => {
    expect(
      resolveVoiceProfiles(undefined, { host: 'http://localhost:50021', speakerId: 3 })
    ).toEqual([{ type: 'voicevox', url: 'http://localhost:50021', speakerId: 3 }]);
  });
});
