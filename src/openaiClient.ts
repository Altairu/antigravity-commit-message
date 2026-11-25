import { CancelledError, ProviderError } from './copilotCli';
import { getMessages } from './i18n';
import type { CancellationLike, ExtensionConfig, ResolvedUiLanguage } from './types';

/**
 * ベース URL から chat/completions エンドポイント URL を組み立てる
 */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

/**
 * OpenAI 互換 API の JSON レスポンスから生成テキストを抽出する
 */
export function extractChatCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }
  const first = choices[0];
  if (!first || typeof first !== 'object') {
    return '';
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== 'object') {
    return '';
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * OpenAI 互換 API を呼び出してコミットメッセージを生成する
 */
export async function runOpenAiCompatible(
  prompt: string,
  config: ExtensionConfig,
  apiKey: string,
  token?: CancellationLike,
  lang: ResolvedUiLanguage = 'ja'
): Promise<string> {
  if (token?.isCancellationRequested) {
    throw new CancelledError();
  }

  const m = getMessages(lang);
  const url = buildChatCompletionsUrl(config.apiBaseUrl);
  const model = config.apiModel.trim();

  if (!url || !model) {
    throw new ProviderError('other', m.apiMissingUrlOrModel);
  }

  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutSeconds * 1000);

  const cancelDisposable = token?.onCancellationRequested(() => {
    cancelled = true;
    controller.abort();
  });

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey.trim().length > 0) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError('auth', m.apiAuthFailed(response.status));
      }
      if (response.status === 404 || /model/i.test(rawText)) {
        throw new ProviderError('model_unavailable', m.apiModelUnavailable(response.status, rawText.slice(0, 300)));
      }
      throw new ProviderError('other', m.apiRequestFailed(response.status, rawText.slice(0, 300)));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new ProviderError('other', m.apiInvalidJson);
    }

    const text = extractChatCompletionText(parsed);
    if (!text.trim()) {
      throw new ProviderError('other', m.apiEmptyResponse);
    }

    return text;
  } catch (error) {
    if (cancelled) {
      throw new CancelledError();
    }
    if (timedOut) {
      throw new ProviderError('timeout', m.apiTimeout(config.timeoutSeconds));
    }
    if (error instanceof ProviderError || error instanceof CancelledError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new ProviderError('other', m.apiNetworkFailed(detail));
  } finally {
    clearTimeout(timer);
    cancelDisposable?.dispose();
  }
}
