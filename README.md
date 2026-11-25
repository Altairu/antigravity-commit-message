# Copilot CLI Commit Message

英語版ドキュメントは同梱の `README.en.md` を参照してください。

Antigravity IDE や VS Code 互換エディタ上で、Git の変更差分から高精度なコミットメッセージを生成するための拡張機能です。GitHub Copilot CLI に加えて、Google Gemini や OpenAI や Ollama や OpenRouter などの OpenAI 互換 API にも対応しています。

## 背景と特徴

組み込みのコミットメッセージ生成機能では、未ステージの変更が混ざったり、プロジェクトの規約や言語設定が反映されにくかったりすることがあります。本拡張機能では、次のような前処理とプロンプト設計によって安定した品質を実現しています。

* ステージングされた変更差分を優先して取得し、ステージングが空のときだけ未ステージの変更と未追跡ファイルを自動対象にします。
* 変更サマリーや直近のコミット履歴やブランチ名に加えて、リポジトリ内の規約ファイルとカスタム指示をまとめてプロンプトへ渡します。
* ロックファイルやビルド成果物などのノイズとなるファイルを差分取得から自動除外し、巨大な `.ipynb` 等が含まれていてもバッファ超過を起こさず上限文字数で安全に切り詰めます。
* 専用の設定 GUI 画面を備えており、日本語モードと英語モードの即時切替、プリセット適用、接続テスト、API キーの安全な保存ができます。
* エラー通知から 設定を開く / ログを見る / GitHub Copilot 設定を開く をワンクリックで呼び出せます。

## インストール

* GitHub Releases から最新の `.vsix` ファイルをダウンロードします: https://github.com/Altairu/antigravity-commit-message/releases
* Antigravity IDE または VS Code の拡張機能ビュー右上メニューにある Install from VSIX からダウンロードしたファイルを選択して導入します。

## 前提条件とセットアップ

### GitHub Copilot CLI を使う場合

* ローカル環境に GitHub Copilot CLI がインストールされており、`copilot login` で認証済みであること。
* Copilot Fusion を使う場合はモデル名を `fusion` に設定します。本拡張機能の既定値は `fusion` です。

### OpenAI 互換 API を使う場合

* ソースコントロールパネル上部の歯車アイコンから専用設定画面を開き、使用するプロバイダーを OpenAI 互換 API に変更します。
* クイック入力ボタンから Google Gemini や OpenAI や Ollama ローカルや OpenRouter を選び、必要に応じて API キーを入力します。
* 接続テストボタンで疎通を確認してから保存してください。API キーはエディタ標準の SecretStorage に暗号化保存されます。

## 使い方

* ソースコントロールパネル上部のキラキラアイコン、またはコマンドパレットから Copilot CLI でコミットメッセージを生成を実行します。
* ソースコントロールパネル上部の歯車アイコン、またはコマンドパレットから Copilot CLI Commit の設定を開くを実行すると専用の設定 GUI が開きます。

## 設定項目一覧

| 設定キー | 説明 | 既定値 |
| --- | --- | --- |
| `copilotCliCommit.uiLanguage` | 画面や通知の表示言語 | `auto` |
| `copilotCliCommit.provider` | 接続先プロバイダー | `copilot-cli` |
| `copilotCliCommit.language` | 生成するコミットメッセージの言語 | `ja` |
| `copilotCliCommit.style` | 出力書式 | `conventional` |
| `copilotCliCommit.includeBody` | 箇条書きの本文を含めるか | `false` |
| `copilotCliCommit.model` | Copilot CLI で使うモデル名 | `fusion` |
| `copilotCliCommit.reasoningEffort` | Copilot CLI の推論の深さ | 空文字 |
| `copilotCliCommit.cliPath` | Copilot CLI の実行コマンド名またはパス | `copilot` |
| `copilotCliCommit.apiBaseUrl` | OpenAI 互換 API のベース URL | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `copilotCliCommit.apiModel` | OpenAI 互換 API のモデル名 | `gemini-3.5-flash-lite` |
| `copilotCliCommit.fallbackToUnstaged` | ステージングが空のときに未ステージ対象化 | `true` |
| `copilotCliCommit.customInstructions` | プロンプトへの追加指示 | 空文字 |
| `copilotCliCommit.instructionFiles` | 読み込むリポジトリ内規約ファイル | `[".github/copilot-instructions.md"]` |
| `copilotCliCommit.recentCommitsCount` | 参考にする直近コミット件数 | `10` |
| `copilotCliCommit.maxDiffChars` | 差分の最大文字数 | `24000` |
| `copilotCliCommit.excludePatterns` | 差分取得から除外するパターン | ロックファイル等 |
| `copilotCliCommit.timeoutSeconds` | 実行タイムアウト秒数 | `60` |

## トラブルシューティング

* `No supported model available` が出る場合は、設定画面で Copilot CLI モデル名が `fusion` になっているか確認するか、プロバイダーを OpenAI 互換 API に切り替えてください。
* 詳細なログは下部パネルの出力タブから `Copilot CLI Commit` を選ぶと確認できます。

## 開発とビルド

* 依存パッケージの導入: `npm install`
* 型チェックとビルドとテスト: `npm run typecheck && npm run build && npm test`
* VSIX パッケージの作成: `npm run package`
* GitHub Releases での自動ビルド: `package.json` のバージョンを更新したうえで `git tag v0.x.y` と `git push origin v0.x.y` を実行すると、GitHub Actions が自動でテスト・ビルド・`.vsix` 添付リリースを作成します。
* Marketplace と Open VSX への自動公開: GitHub リポジトリの Secrets に `VSCE_PAT` と `OVSX_PAT` を登録しておくと、タグプッシュ時に Visual Studio Marketplace と Open VSX Registry へも自動で公開されます。事前に `package.json` の `publisher` をご自身の公開者 ID に変更してください。

## ライセンス

MIT License で公開しています。詳細は同梱の `LICENSE` ファイルを参照してください。
