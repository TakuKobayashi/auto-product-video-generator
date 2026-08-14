# auto-product-video-generator

WebおよびAndroidアプリ向けのAIプロモーション動画自動生成ツールです。実在するgit管理プロジェクトを
指定すると、実際のソースコードを読み込み、録画計画を立て、ブラウザまたはAndroid端末を操作し、
ナレーション付きの動画を生成します。

---

## 実行時に利用する外部環境

npmパッケージではNode.jsやパッケージマネージャーのバージョンを強制していません。また、実行時に
pnpmは必要ありません。gitはリポジトリ取得、Dockerまたは別途起動したVOICEVOX Engineは音声生成、
Android SDK（`adb`、`emulator`）と作成済みAVDはAndroid録画を使う場合にだけ必要です。SDKは
`target.android.sdkPath`、`ANDROID_SDK_ROOT`、`ANDROID_HOME`のいずれかで指定できます。
リポジトリのセットアップコマンドでは、ffmpeg、Playwright、Task、任意でOllamaもまとめて準備します。

## クイックスタート

```bash
git clone <このリポジトリ> && cd auto-product-video-generator

task install          # 初回のみ: 必要なもの一式をインストール（内訳は task --list）
task serve            # ローカルサービスを起動（VOICEVOX、Ollama）
task doctor           # 何か足りてるか不安なら実行

# 動画化したいプロジェクトを指定（ローカルURLと起動方法はソースから推定）
pnpm apvg project init --repo https://github.com/you/your-app.git
#   ローカルに既にある場合は: --source ../your-app

pnpm apvg video generate # 動画を作る
```

Android、Flutter、React Nativeは、GitHub URLまたはローカルソースだけでプラットフォームを判定し、
Debug APKのビルド、停止中AVDの起動、boot待機、application id検出、APKインストール、録画まで
自動実行します。

```bash
pnpm apvg project init --repo https://github.com/you/your-android-app.git
pnpm apvg video generate
```

接続済み端末があればそれを使い、なければインストール済みAVDの先頭を起動します。AVDが未作成の場合は
Android StudioのDevice Managerで一度作成してください。複数端末や独自ビルドでは
`target.android.avd`、`serial`、`buildCommand`、`apkPath`などを指定できます。
SDKを環境変数で指定しない場合は`target.android.sdkPath`を設定します。
`target.android.activity`は省略可能で、省略時はランチャーActivityを自動起動します。
生成された端末向けシナリオは、安全のため推測したボタン名をタップせず、起動・待機・スワイプを
中心にします。実際のラベルが分かる場合は`.apvg/scenario.yaml`へ`tap`、`input_text`、
`back`などを追加してから`pnpm apvg video record`を実行できます。

Unityのバッチモードはプロジェクト固有のBuild Methodが必要なため、Unityでは既存APK、または
`target.android.buildCommand`を指定します。生成後のAVD起動・インストール・ADB録画は同じく自動です。
iOSとUnity Desktopの録画は未対応です。

`init`が`apvg.config.yaml`を生成します。動画化するソースがGitHub等にある場合は`--repo`、
ローカルにある場合は`--source`を使います。非エンジニア向け・使い方中心という編集方針は
ツール本体のデフォルトなので、設定ファイルへの追記は不要です。
`--url`を省略すると、LLMがpackage.jsonの起動スクリプトとREADMEを読み、起動コマンドと
`localhost`のURL（ポートを含む）を推定してconfigへ保存します。既にURLが決まっている場合だけ
`--url http://localhost:3000`を指定してください。明示指定した値は推定値で上書きされません。

モノレポの場合も通常は追加設定不要です。APVGはclone/updateのたびにワークスペースを走査し、
`apps/web`のような実行可能なWebアプリを優先して、そのディレクトリの画面・ルート・起動コマンドを
解析します。選択結果は`.apvg/source-context.json`の`projectPath`に記録されます。意図したアプリと
異なる場合は`source.platformPriority`で種類の優先順位を変更できます（デフォルトはWebが最優先）。
特定アプリに固定する場合だけ、初期化時の`--project-path apps/web`または
`apvg.config.yaml`の`source.projectPath`を使います。初期化時にも、たとえば
`--platform-priority web,android,flutter`と指定できます。
依存関係はモノレポのルートで、開発サーバーは選択したアプリのディレクトリで自動実行されます。

VOICEVOX EngineやOllamaを別の`docker compose up -d`で起動している場合、`task serve`は
省略できます。その場合もホスト側からVOICEVOXの`http://localhost:50021`とOllamaの
`http://localhost:11434`へ到達できるよう、Composeでポートを公開してください。
`task doctor`、または次のコマンドで起動状態を確認できます。

```bash
curl http://localhost:50021/version
curl http://localhost:11434/api/tags  # Ollamaを使う場合のみ
```

`pnpm apvg`は`development`条件付きexportsと`tsx`を使って、すべてのワークスペースの
TypeScriptソースを直接実行するため、クリーンなcheckoutでも事前の
`pnpm build`は不要です。`pnpm build`はCI・配布前の型チェックとJavaScript生成にだけ使います。

`task`コマンドが無くても、下記はすべて`pnpm install`だけで動きます — 各`task`コマンドが
実際に何をしているかは[Taskfile.yml](./Taskfile.yml)に、`pnpm run <name>`という
素のエイリアスは[package.json](./package.json)にあります。

出力先は完成動画が`output/final.mp4`、途中生成物が`output/artifacts/`です。
`artifacts/`にはscenario/script、字幕、WAV音声、シーン録画、スクリーンショット、
timeline、分析結果、ログ、使用した設定が保存されます。`GEMINI_API_KEY`を設定して
いない場合は自動的にOllamaが使われます。設定項目の全リストは`examples/apvg.config.yaml`を見てください（各項目に
コメントで説明が書いてあるので、ここでは重複させません）。

## GitHub Actionsで自動生成

[generate-demo.yml](./.github/workflows/generate-demo.yml)はGitHub-hostedの
`ubuntu-latest` runnerだけで動画生成を完結します。`main`ブランチへのpushで自動実行され、
Actions画面の`Run workflow`から手動実行することもできます。

現在の動画化対象はworkflow内で次へ固定しています。

```text
https://github.com/TakuKobayashi/tappunpages.git
```

runner内でNode.js、pnpm、Playwright Chromium、システム版ffmpeg、Ollama、VOICEVOX Engineを準備します。
RAM 15 GB以上かつ空きディスク11 GB以上なら`qwen2.5:14b-instruct`、次に7B、
リソースが少ない場合だけ3Bを選び、各CLI工程を順番に実行します。LLM工程後はモデルを
メモリーとディスクから削除してからVOICEVOXを起動します。
Gemini APIキーなどのsecretは不要です。成功するとActions runのArtifactsに
`promotional-video-<run番号>`が追加され、`final.mp4`と`output/artifacts/`一式を
ダウンロードできます。失敗時も`.apvg/`、Ollama、VOICEVOXのログを診断Artifactとして保存します。

GitHub-hosted runnerではOllamaをCPU実行するため時間がかかります。公開リポジトリの
`ubuntu-latest`（16 GB RAM）では、空きディスクも条件を満たせば14Bが選択されます。workflowのtimeoutは
6時間に設定しています。同じブランチへ続けてpushした場合は、古い生成runをキャンセルして
新しいrunを優先します。

---

## 全体の流れ

```mermaid
flowchart TD
    init(["<b>init</b><br/>--repo / --source"]) -->|生成| cfg[(apvg.config.yaml)]

    subgraph build["pnpm apvg video generate （下の5つをまとめて実行）"]
        direction TB
        analyze(["<b>analyze</b><br/>ソースをclone/読込み、<br/>AIが機能・プラットフォーム・<br/>起動計画を抽出"])
        scenario(["<b>scenario generate</b><br/>AIが録画計画<br/>(scenario.yaml)を生成"])
        voice(["<b>voice</b><br/>VOICEVOXでナレーション合成"])
        record(["<b>record</b><br/>音声の実時間に合わせて<br/>プラットフォーム別に録画"])
        render(["<b>render</b><br/>ffmpegで合成"])
        analyze -->|project-summary.json| scenario
        scenario -->|scenario.yaml, script.yaml| voice
        voice -->|実時間を反映したscript.yaml| record
        record -->|recordings/*.mp4| render
    end

    cfg --> analyze
    render -->|output/final.mp4| done(["🎬 完成"])
```

## 実行方法：一括実行と個別実行

上図の各箱はそれぞれ独立したCLIコマンドで、すべて`.apvg/`配下のファイルを読み書きします。
つまり`build`はブラックボックスではなく、単にこの5つを順番に実行しているだけです。

通常は次の一括実行だけで構いません。

```bash
pnpm apvg video generate
```

内容を途中で確認・編集したい場合は、必ず次の順番で個別実行します。

```bash
pnpm apvg project analyze
pnpm apvg video scenario generate
pnpm apvg video voice     # WAV生成後、実音声の長さでscript/subtitlesを更新
pnpm apvg video record    # 更新済みscriptとWAVが必須
pnpm apvg video render
```

各コマンドは直前の生成物を使います。途中で止まった場合、成功済みの工程を繰り返す必要は
ありません。再開位置の目安は次のとおりです。

| 最後に成功した工程／変更内容 | 再開コマンド |
|---|---|
| `analyze`まで成功 | `pnpm apvg video scenario generate` |
| `scenario generate`まで成功 | `pnpm apvg video voice` |
| `voice`まで成功 | `pnpm apvg video record` |
| `record`まで成功 | `pnpm apvg video render` |
| narration・テロップ文言を変更 | `pnpm apvg video voice`から |
| 画面操作だけを変更 | `pnpm apvg video record`から |
| 録画・音声は完成済みで合成設定だけ変更 | `pnpm apvg video render`のみ |

| コマンド | 生成物 | 補足 |
|---|---|---|
| `pnpm apvg project init --repo <URL>` | `apvg.config.yaml` | 初回のみ。ローカルの場合は`--source <パス>` |
| `pnpm apvg project analyze` | `.apvg/source-context.json`、`.apvg/project-summary.json` | 決定論的なソース走査 + AIによる分類 |
| `pnpm apvg video scenario generate` | `.apvg/scenario.yaml`、`.apvg/script.yaml`、`.apvg/subtitles.srt` | scenarioはAI生成、script/subtitlesはそこから決定論的に算出 |
| `pnpm apvg video voice` | `.apvg/voice/*.wav` | 実音声の長さでscript/subtitlesの時刻も更新 |
| `pnpm apvg video record` | `.apvg/recordings/*.mp4` | 音声の実時間に合わせて操作し、到達不能なら停止 |
| `pnpm apvg video render` | `output/final.mp4`、`output/artifacts/` | 完成動画と途中生成物一式を出力 |

`pnpm apvg video generate [--skip-analyze] [--skip-scenario] [--skip-record] [--skip-voice]`
は上記5つをまとめて実行し、指定したステップだけ既存の生成物を使って
スキップできます。各コマンドの全オプションは`--help`で確認できます
（例: `pnpm apvg project analyze --help`）。CLI全体は`pnpm apvg --help`で確認できます。

`--skip-voice`と録画を組み合わせる場合も、既存の`.apvg/voice/*.wav`が必要です。
録画前に既存WAVを測り直すため、音声なしの状態で録画だけを先行することはできません。
ナレーションや`sceneGapSeconds`を変更した場合は、`voice → record → render`を再実行してください。

---

## 設定ファイル

`apvg.config.yaml` — 全項目の説明は**[`examples/apvg.config.yaml`](./examples/apvg.config.yaml)**
にコメント付きで書いてあります（gitソース指定、対象URL、動画タイプ、LLMプロバイダー/
フォールバック/タスク別モデル、VOICEVOX等）。ここでは意図的に重複させていません
— あのファイル自体がドキュメントです。

最初に知っておくとよいのは以下の4点です。

- **LLMプロバイダー**: `gemini`（`GEMINI_API_KEY`が必要）か`ollama`（完全ローカル、
  キー不要）。`init`はその時点で使えるほうを自動選択します。APIキーが設定済みの
  プロバイダーだけを`fallbackProvider`に指定できます。必須APIキーが未設定の
  フォールバックは自動的に無効化されます。`analyze`と`scenario generate`は`llm.tasks`で**別々の
  モデル**を指定可能です — `scenario generate`のほうが難しいタスクなので、
  `analyze`より強いモデルが必要になることがあります。
- **アプリの起動**: `analyze`が`package.json`から起動コマンド（`npm run dev`等）を
  自動検出し、`scenario.yaml`の`setup`計画に焼き込みます。`record`/`build`は
  それを使って自動的にアプリを起動します。`target.url`へ到達できない場合やブラウザ操作が
  失敗した場合は、白画面や部分録画を完成品にせずエラーで停止します。
- **シーン間の無音**: `video.sceneGapSeconds`（デフォルト`1`秒）で、ナレーションと
  シーンの間隔を調整できます。この値は音声合成後のscript、字幕、録画時間へ反映されます。
- **Web画面の準備待ち**: `video.pageReadyWaitSeconds`（デフォルト`2`秒）で、最初の
  ページ読み込み完了後に画面が落ち着くまで待つ時間を指定できます。読み込み中の白画面と
  待機区間は録画素材から除去され、音声・テロップは準備完了後から始まります。
- **編集方針**: 設定不要の組み込みデフォルトとして、非エンジニアを対象に、技術仕様では
  なく実際の使い方、できること、利用者のメリットを紹介します。
  App Router、TypeScript、Cloudflare、Hono、APIなどの実装用語がナレーションへ
  入った場合は検証エラーとして再生成されます。

---

## トラブルシューティング

### `scenario generate`がスキーマ検証で何度も失敗する

使っているモデルがそのタスクに向いていない可能性が高いです。`llm.tasks.scenario`
だけを別の（より強い）モデルに向けてください（`examples/apvg.config.yaml`参照）。
`analyze`側の設定は変えなくて大丈夫です。警告メッセージには、モデルが具体的に
どのフィールドを間違えたかも表示されます。

### `pnpm install`がffmpegやtaskのダウンロードで失敗する

`ffmpeg-static`や`@go-task/cli`はGitHubリリースからバイナリをダウンロードする
postinstallスクリプトを持っており、社内プロキシ等でブロックされると失敗することが
あります。まず再実行してみてください。ffmpegは手動インストールしても自動検出されます
（`winget install ffmpeg` / `brew install ffmpeg` / `apt install ffmpeg`）。`task`が
無くても`pnpm run <name>`側で代替できます。

### `pnpm run build`や`pnpm apvg`が`ERR_PNPM_IGNORED_BUILDS`で失敗する

```bash
pnpm approve-builds
```
を実行し、`ffmpeg-static` / `@go-task/cli` / `esbuild`を承認してください。

### `pnpm apvg project init`が「--repo か --source が必要」と言う

`analyze`が実際のソースコードを読む設計のため、`init`の時点で対象を指定する必要が
あります: `pnpm apvg project init --repo <URL>` または `--source <パス>`（gitリポジトリ
である必要あり）。

### `scenario.yaml`のURLが実際のページと合っていない

自動ルート検出は現時点でNext.js（App/Pages Router）のみ対応です。
`.apvg/source-context.json`の`routes`が空なら、AIがファイル一覧から推測しているため
精度が落ちます。`scenario.yaml`の`goto`アクションを手動で修正してから`record`して
ください。

### VOICEVOX / Ollamaに接続できない

```bash
task serve          # 両方まとめて起動を試みる
task doctor          # 何が足りないか診断
```

Docker Composeを使う場合は、少なくともVOICEVOXの`50021:50021`を公開してください。
Ollamaもコンテナで動かす場合は`11434:11434`が必要です。`voice`が成功する前に`record`へ
進むことはできません。

### 録画が対象URLやブラウザ操作のエラーで停止する

まず`target.url`を通常のブラウザで開けるか確認してください。次に`.apvg/scenario.yaml`の
`goto`、`click`、`wait_visible`が実際の画面と合っているか確認します。修正後は音声を
変えていなければ`pnpm apvg video record`、ナレーションも変えた場合は
`pnpm apvg video voice`から再実行してください。

### とにかく何もわからない

```bash
task doctor
```

---

## 開発

```
packages/
├── cli/          コマンド定義（Commander） + 実行ロジック
├── core/         共通の型定義（Zodスキーマ — 正確なフィールド定義はここを見てください）
├── source/       gitクローン/ローカル読込み、ルート・プラットフォーム検出
├── ai/           LLMプロバイダー + analyze/scenario-generateパイプライン
├── playwright/   Web録画
├── recorder/     プラットフォーム選択 + Android/ADB録画
├── voicevox/     音声合成
└── renderer/     ffmpegレンダリング

scripts/doctor.ts   環境診断（task doctor）
Taskfile.yml        環境構築・サーバー起動
```

```bash
task build          # または: pnpm run build（CI・配布前の型チェック／JS生成）
pnpm apvg --help     # 整理されたCLIのコマンド一覧
```

## ライセンス

MIT
