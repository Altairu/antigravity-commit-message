import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getCliInstallOptions } from '../src/cliInstaller';

describe('getCliInstallOptions', () => {
  it('Windows では WinGet と npm の候補を返すこと', () => {
    const options = getCliInstallOptions('win32', 'ja');
    assert.equal(options.length, 2);
    assert.equal(options[0].id, 'winget');
    assert.equal(options[0].command, 'winget install GitHub.Copilot');
    assert.equal(options[1].id, 'npm');
    assert.equal(options[1].command, 'npm install -g @github/copilot');
  });

  it('macOS では Homebrew と npm の候補を返すこと', () => {
    const options = getCliInstallOptions('darwin', 'ja');
    assert.equal(options.length, 2);
    assert.equal(options[0].id, 'brew');
    assert.equal(options[0].command, 'brew install --cask copilot-cli');
    assert.equal(options[1].id, 'npm');
  });

  it('Linux では npm / 公式スクリプト / Homebrew の候補を返すこと', () => {
    const options = getCliInstallOptions('linux', 'en');
    assert.equal(options.length, 3);
    assert.equal(options[0].id, 'npm');
    assert.equal(options[1].id, 'curl');
    assert.equal(options[1].command, 'curl -fsSL https://gh.io/copilot-install | bash');
    assert.equal(options[2].id, 'brew');
    assert.match(options[0].label, /Recommended/);
  });
});
