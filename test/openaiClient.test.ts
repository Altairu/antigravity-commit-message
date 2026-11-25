import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildChatCompletionsUrl, extractChatCompletionText } from '../src/openaiClient';

describe('buildChatCompletionsUrl', () => {
  it('末尾のスラッシュを整理して chat/completions を付与すること', () => {
    assert.equal(
      buildChatCompletionsUrl('https://api.openai.com/v1/'),
      'https://api.openai.com/v1/chat/completions'
    );
    assert.equal(
      buildChatCompletionsUrl('https://generativelanguage.googleapis.com/v1beta/openai'),
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    );
  });

  it('すでに chat/completions で終わっている場合は二重付与しないこと', () => {
    assert.equal(
      buildChatCompletionsUrl('http://localhost:11434/v1/chat/completions'),
      'http://localhost:11434/v1/chat/completions'
    );
  });
});

describe('extractChatCompletionText', () => {
  it('文字列形式の content を取り出せること', () => {
    const payload = {
      choices: [{ message: { content: 'feat: 新しい設定画面を追加' } }]
    };
    assert.equal(extractChatCompletionText(payload), 'feat: 新しい設定画面を追加');
  });

  it('配列形式の content からテキストを結合して取り出せること', () => {
    const payload = {
      choices: [{ message: { content: [{ type: 'text', text: 'fix: ' }, { type: 'text', text: '不具合を修正' }] } }]
    };
    assert.equal(extractChatCompletionText(payload), 'fix: 不具合を修正');
  });

  it('不正なレスポンスでは空文字を返すこと', () => {
    assert.equal(extractChatCompletionText(null), '');
    assert.equal(extractChatCompletionText({ choices: [] }), '');
  });
});
