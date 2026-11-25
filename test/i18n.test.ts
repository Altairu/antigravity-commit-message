import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getMessages, resolveUiLanguage } from '../src/i18n';

describe('resolveUiLanguage', () => {
  it('明示指定された ja と en はそのまま返すこと', () => {
    assert.equal(resolveUiLanguage('ja', 'en-US'), 'ja');
    assert.equal(resolveUiLanguage('en', 'ja-JP'), 'en');
  });

  it('auto のときはエディタ言語が ja で始まれば ja、それ以外は en を返すこと', () => {
    assert.equal(resolveUiLanguage('auto', 'ja'), 'ja');
    assert.equal(resolveUiLanguage('auto', 'ja-JP'), 'ja');
    assert.equal(resolveUiLanguage('auto', 'en-US'), 'en');
    assert.equal(resolveUiLanguage('auto', 'fr'), 'en');
  });
});

describe('getMessages', () => {
  it('日本語と英語の辞書がそれぞれ非空の文言を返すこと', () => {
    const ja = getMessages('ja');
    const en = getMessages('en');

    assert.ok(ja.progressTitle.length > 0);
    assert.ok(en.progressTitle.length > 0);
    assert.notEqual(ja.actionOpenSettings, en.actionOpenSettings);
    assert.match(en.modelUnavailable, /fusion/);
  });
});
