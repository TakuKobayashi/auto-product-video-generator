import { describe, expect, it } from 'vitest';
import { resolveVoiceProfiles } from './client.js';

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
