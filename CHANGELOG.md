# Changelog

## 1.0.0

* 正式リリース版です。
* GitHub Copilot CLI および OpenAI 互換 API からのコミットメッセージ生成、専用設定 GUI、日本語と英語の UI モード、GitHub Actions による自動リリースに対応しています。

## 0.3.3

* コマンド名、設定パネル、出力チャンネル、README の名称を `Copilot CLI Commit Message` に統一しました。

## 0.3.2

* Open VSX Registry と Visual Studio Marketplace からのインストール手順および初期設定の流れを README に追記しました。

## 0.3.1

* 公開者 ID を `Altairu` に設定しました。
* GitHub Actions から Visual Studio Marketplace と Open VSX Registry へ自動公開するリリースフローを追加しました。

## 0.3.0

* 日本語モードと英語モードの完全対応を追加しました (`copilotCliCommit.uiLanguage` および `package.nls.json` / `package.nls.ja.json`)。
* 専用設定 GUI 上で表示言語をリアルタイムに切り替えられるようにしました。
* 拡張機能アイコン (`media/icon.png`) と MIT ライセンス (`LICENSE`) を追加しました。
* 日本語と英語の README および CHANGELOG を整備しました。

## 0.2.1

* Copilot CLI の既定モデルを `fusion` に変更しました。
* Google Gemini クイック入力の既定モデルを `gemini-3.5-flash-lite` に更新しました。

## 0.2.0

* 専用の設定 GUI パネルとプリセット機能と接続テスト機能を追加しました。
* OpenAI 互換 API プロバイダーを追加し、Google Gemini や OpenAI や Ollama や OpenRouter に対応しました。
* エラー通知から設定画面やログや GitHub Copilot 設定ページを開くワンクリック誘導ボタンを追加しました。

## 0.1.2

* `git` コマンドの実行をストリーミング読み込みへ変更し、巨大な `.ipynb` 等の差分によるバッファ超過エラーを解消しました。

## 0.1.1

* ステージングが空のときに未ステージの変更と未追跡ファイルも自動対象にする設定を既定で有効化しました。

## 0.1.0

* 初回リリース。GitHub Copilot CLI を使ったコミットメッセージ生成機能を実装しました。
