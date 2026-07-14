# demo-video-gen

Webアプリ・CLIツール向けのAIプロモーション動画自動生成ツールです。

- **`analyze`は実際のプロジェクトを読み込みます** — gitリポジトリをclone（またはローカルの
  既存チェックアウトを読み込み）し、`package.json`・README・（対応フレームワークの場合）
  実際のページルートをAIに読ませて録画計画を立てます。URLだけを見て想像で生成することはしません
- **AIが担当するのは** シナリオ・ナレーション・字幕・タイムラインの生成（YAML/JSON）— しかも
  実際のソースコードに基づいて生成されます
- **決定論的な処理が担当**するもの: gitクローン・ルート検出、録画（Playwright）、
  音声合成（VOICEVOX）、動画合成（ffmpeg）
- 各ステップの中間ファイルはすべて人間が編集可能
- **ローカルLLMファースト**: Ollamaで完全オフライン実行、Geminiクラウド、あるいは両方を併用（自動フォールバック）も可能
- 環境構築・サーバー起動は [`Taskfile.yml`](./Taskfile.yml) にコマンド1つずつで集約
- `analyze`はプロジェクトの種別（web/ios/android/unity/flutter/react-native/desktop/other）を
  判定し`scenario.yaml`に記録します。録画そのもの（Playwright）は現時点ではWeb限定ですが、
  それ以外のプラットフォームも判定・記録はされます（録画にはまだ非対応というだけです）

---

## 全体の流れ

```
1. init      --repo <git URL>  または  --source <ローカルパス>  （gitプロジェクトである必要あり）
                    │
                    ▼
2. analyze   git clone（またはローカルのチェックアウトをそのまま使用）
             → package.json / README を読み込み
             → 実際のページルートを検出（Next.js App Router / Pages Router に対応。
               それ以外のフレームワークはファイル一覧のフォールバック）
             → プラットフォームのシグナルも検出（Podfile, build.gradle, pubspec.yaml 等）
             → AIがプラットフォーム（web/ios/android/unity/...）を判定しつつ
               project-summary.json を生成（各機能に実在するルートを紐付け）
                    │
                    ▼
3. scenario generate   AIが project-summary.json + 実在するルート一覧から
                        scenario.yaml（録画計画: どのURLを訪れ、何をクリックするか）
                        + script.yaml（ナレーション） + subtitles.srt を生成
                    │
                    ▼
4. record    Playwrightが scenario.yaml の計画通りに `target.url` に対して操作を実行
             （そのURLで実際にアプリが起動している必要があります。起動自体はこのツールでは
               行いません — 事前に `npm run dev` 等で起動しておいてください）
                    │
                    ▼
5. voice / render   VOICEVOXナレーション + ffmpeg合成 → output/final.mp4
```

`scenario.yaml`こそが本来の「録画実行計画」です。他の中間ファイルと同様、ステップ3と4の間で
自由に人間が編集できます。

LLM呼び出し中は数秒おきに「... still working, Ns elapsed」という進捗表示が出るため、
ローカルモデルが遅くてもコマンドが固まっているように見えることはありません。
LLMの返したJSONがスキーマと合わない場合は、実際のバリデーションエラーを自動的に
LLMへフィードバックして再生成させます（最大2回リトライ）。それでも失敗した場合は
読みやすい形式でエラーを表示します。

---

## クイックスタート

```bash
# 1. プロジェクトを取得
git clone <このリポジトリ>
cd demo-video-gen

# 2. 必要な環境を一括インストール
#    Node依存関係 / ffmpeg・ffprobe（自動ダウンロード） / Playwrightのブラウザ /
#    （任意で）Ollama + ローカルLLMモデル
task install

# 3. ローカルで必要なサーバーを一括起動（VOICEVOX EngineをDockerで、Ollamaデーモンを起動）
task serve

# 4. 環境が整っているか不安なときは診断コマンドを実行
task doctor

# 5. 動画化したいプロジェクト（gitリポジトリ。リモートでもローカルでも可）と、
#    そのアプリが実際に起動するURLを指定します
#    （URLで実際にアプリが動くようにするのは自分で行ってください。例えば別ターミナルで npm run dev）
pnpm dev -- init --repo https://github.com/your-org/your-app.git --url http://localhost:3000
# ローカルに既にチェックアウト済みのプロジェクトの場合:
# pnpm dev -- init --source ../your-app --url http://localhost:3000

# 6. 上で指定したURLで実際にアプリが起動していることを確認してください

# 7. 動画を生成する
pnpm dev -- build
```

`task` コマンドが手元に無い場合は、まず [Taskのインストール方法](https://taskfile.dev/installation/)
を参照してください（`pnpm install`で入る`@go-task/cli`からも自動的に使えるようになります）。
`package.json`にも`pnpm run setup` / `pnpm run serve` / `pnpm run doctor`という
同じ内容のエイリアスを用意しています（内部では`task install`等をそのまま呼んでいます）。

生成された動画は`./output/final.mp4`に出力されます。

> 「そもそもどう動かせばいいかわからない」という場合は、まず`task doctor`を実行してみてください。
> 何が足りていないかをチェックリスト形式で表示します。
> 利用可能な全タスクは`task --list`で確認できます（各タスクの説明は日本語で書かれています）。

---

## 必要な環境

| ツール | バージョン | 備考 |
|------|---------|-------|
| Node.js | ≥ 20 | |
| pnpm | ≥ 9 | `corepack enable` で導入できます |
| git | 最近のバージョン | 必須 — `analyze`が実際のプロジェクトソースをclone/読み込みするために使用 |
| [Task](https://taskfile.dev) | ≥ 3 | `pnpm install` で自動導入（devDependency `@go-task/cli`）。手動導入も可 |
| ffmpeg / ffprobe | — | **`ffmpeg-static` / `ffprobe-static` により自動ダウンロードされるため手動インストール不要** |
| Playwright（Chromium） | — | `task install` でインストールされます |
| Docker | 最近のバージョン | VOICEVOX Engineの起動に必要（`task serve`） |
| Ollama | 任意 | 完全ローカル/オフラインでLLMを使いたい場合のみ必要（`task install` で一緒にセットアップ可能） |

---

## タスク一覧

`Taskfile.yml` がすべての環境構築・サーバー起動の入り口です。中身は基本的に
「実際のコマンドをそのまま順番に並べたもの」で、OS判定は Task 組み込みの `{{OS}}` 変数
（linux/darwin/windows）、スキップ判定は `status:` を使っており、別途スクリプトで
ラップしていません（メンテナンスコストを抑えるため）。

| タスク | 内容 |
|---|---|
| `task install` | `install:node` → `install:playwright` → `install:ollama` を順に実行 |
| `task install:node` | `pnpm install`（ffmpeg-static/ffprobe-staticの自動ダウンロードも含む） |
| `task install:playwright` | Chromiumをインストール（Linuxでは追加でOS依存パッケージも試行） |
| `task install:ollama` | Ollama本体のインストール＋`PROFILE`に応じたモデルのpull（`WITH_OLLAMA=false`ならスキップ） |
| `task serve` | `serve:voicevox` → `serve:ollama` を順に実行 |
| `task serve:voicevox` | VOICEVOX EngineをDockerで起動しヘルスチェック（起動済みならスキップ） |
| `task serve:ollama` | `ollama serve`をバックグラウンド起動しヘルスチェック（`WITH_OLLAMA=false`または起動済みならスキップ） |
| `task stop` | `task serve`で起動したVOICEVOXコンテナを停止 |
| `task doctor` | 環境診断（`scripts/doctor.ts`をtsxで実行） |
| `task build` | 全パッケージをビルド |
| `task dev -- <args>` | CLIを実行（初回・変更後は自動でビルドしてから実行） |
| `task quickstart` | `install` → `serve` をまとめて実行し、次の手順を表示 |

`PROFILE`（`local`がデフォルト / `ci`）と `WITH_OLLAMA`（`true`がデフォルト / `false`）は
自由に組み合わせて指定できます。

```bash
task install PROFILE=local WITH_OLLAMA=true    # 開発機、ローカルLLMもフル活用
task install PROFILE=ci WITH_OLLAMA=false      # CI環境、Gemini APIのみ使用
task serve PROFILE=local WITH_OLLAMA=true
```

### `package.json` のエイリアス

| `pnpm run` | 実体 |
|---|---|
| `pnpm run setup` | `task install` |
| `pnpm run setup:full` | `task install PROFILE=local WITH_OLLAMA=true` |
| `pnpm run setup:cloud-only` | `task install PROFILE=local WITH_OLLAMA=false` |
| `pnpm run setup:ci` | `task install PROFILE=ci WITH_OLLAMA=true` |
| `pnpm run serve` | `task serve` |
| `pnpm run serve:stop` | `task stop` |
| `pnpm run doctor` | `task doctor` |

（`pnpm run build` / `pnpm run dev` / `pnpm run clean` は実体そのもの（`tsc -b`・`tsx`・等）で、
`task build` / `task dev` 側がこれらを呼び出す構造になっています。循環を避けるため
逆方向には置き換えていません。なお`pnpm run dev`は毎回`pnpm run build`を先に実行してから
`tsx`を起動します。`tsc -b`は差分ビルドなので2回目以降はほぼ一瞬です — これにより
「ビルドし忘れて動かない」という状態を防いでいます。）

---

## ローカルLLM（Ollama）— Gemini APIとの併用

`dvg.config.yaml` の `llm` セクションでは以下がサポートされています。

- **`provider: gemini`** — クラウド。`GEMINI_API_KEY` が必要。品質は最も高い
- **`provider: ollama`** — 完全ローカル/オフライン。APIキー・ネットワーク不要
- **`fallbackProvider`** — メインのプロバイダーが失敗した場合（オフライン、レート制限、
  モデル未pull、不正なJSONを返した場合など）に自動で切り替わる第2のプロバイダー。
  これにより Ollama と Gemini を**併用**できます（どちらを優先するかは自由に設定可能）。
  フォールバック先は実際に必要になるまで初期化されないため、例えば
  `provider: ollama` をメインにしている限り `GEMINI_API_KEY` が未設定でもエラーには
  なりません（Ollamaが失敗して初めてGemini側のキーが必要になります）

```yaml
llm:
  provider: "ollama"
  model: "qwen2.5:7b-instruct"
  fallbackProvider: "gemini"
  fallbackModel: "gemini-2.5-pro"
```

上記の設定では「まずOllamaで無料・オフラインに試し、失敗したときだけGeminiに切り替える」
という動作になります。優先順位を逆にしたい場合は `provider` と `fallbackProvider` を
入れ替えてください。

`demo-video-gen init` は実行時点の環境を見て賢くデフォルトを選びます。`init`実行時に
`GEMINI_API_KEY` が設定されていれば `provider: gemini` + `fallbackProvider: ollama`、
設定されていなければ `provider: ollama` + `fallbackProvider: gemini` になります。
つまり、`dvg.config.yaml` を手で編集しなくても、今すぐ使えるものでそのまま動く状態が
初期状態から得られます。もちろん後からどちらの設定も自由に変更できます。

### マシンスペックによるモデルの使い分け

`task install` / `task serve` は `PROFILE` 引数によって、実行するマシンに適したモデルを
自動的に選択します（定義は `Taskfile.yml` の `vars:` に集約されています）。

「AIの役割」（プロジェクト解析・シナリオ生成・ナレーション生成など、いずれも**厳密なJSON出力**が
求められるタスク）に適したモデルとして、指示追従性とJSON出力の安定性に定評のある
**Qwen2.5-Instruct** シリーズを採用し、可能な限り同じモデルファミリーに揃えています。

| プロファイル | モデル | 選定理由 |
|---|---|---|
| `local`（例: Ryzen 7 5800H / 64GB RAM / RTX 3050 Ti 4GB VRAM） | `qwen2.5:7b-instruct` | 約4.7GB（Q4_K_M量子化）。4GB VRAMでも部分的にGPUオフロードでき、64GBのRAMがあれば残りのレイヤーをCPU側で処理しても十分な速度が出ます |
| `ci`（GitHub Actions ホステッドランナー） | `qwen2.5:3b-instruct` | 約1.9GB（Q4_K_M量子化）。GPUのないCPUのみの環境でもジョブの時間制限内に収まる軽量さを優先 |

---

## コマンド一覧（CLI本体）

### `init`
プロジェクト設定ファイル（`dvg.config.yaml`）を初期化します。`analyze`は実際のソースコードを
読み込むため、解析対象のプロジェクトの場所指定が必須です。

```bash
demo-video-gen init [directory] [options]

Options:
  --repo <url>         解析対象のgitリポジトリURL（cloneして使用）
                        （--repo と --source のどちらか一方が必須）
  --source <path>       解析対象の、ローカルに既にあるgitプロジェクトへのパス
  --ref <ref>            チェックアウトするブランチ/タグ/コミット（--repoと併用時のみ。
                          省略した場合はリポジトリのデフォルトブランチが使われます）
  --serve-command <cmd>   アプリの開発サーバーを自動起動するコマンド（例: "npm run dev"）。
                           省略した場合、`analyze`がpackage.jsonから自動検出して保存します
  --install-deps           開発サーバー起動前に `npm install` を実行する
                            （フレッシュcloneの場合に便利）
  -u, --url <url>          アプリが起動するURL（デフォルト: http://localhost:3000）。
                            省略可能 — analyze/record/buildもそれぞれ独自の-u/--urlを
                            受け付け、その回だけdvg.config.yamlの値を上書きします
  -t, --type <type>   動画タイプ: teaser|shorts|demo|tutorial（デフォルト: demo）
  -n, --name <name>   プロジェクト名（デフォルト: ソースのディレクトリ名から自動生成）
  --force              既存の dvg.config.yaml を上書き
  --dry-run           ファイルを書き込まずプレビューのみ
```

**アプリの起動について**: `source.startCommand`が設定されていれば（`--serve-command`で
指定するか、`analyze`が自動検出）、`target.url`に到達できない場合`record`/`build`が
自動的にこのコマンドを実行してくれます。別ターミナルで手動起動する必要はありません。
設定されておらずURLにも到達できない場合は、手動で起動するよう分かりやすい警告が出ます。

### `analyze`
プロジェクトソースを解決（`source.repository`ならclone、`source.localPath`なら
gitリポジトリであることを検証）し、決定論的に中身を調査します —
`package.json`とREADMEを読み、Next.js（App Router / Pages Router）の場合は
`app/`・`pages/`を走査して実在するページルートを検出します。それ以外のフレームワークは
容量制限付きのファイル一覧にフォールバックします。この情報をAIに渡し、実在するルートに
紐付けられた形で機能一覧を抽出します。LLMが返したJSONがスキーマと合わない場合は、
エラー内容をLLMにフィードバックして最大2回まで再生成を試みます。

`dvg.config.yaml`に`source.startCommand`が未設定の場合、package.jsonのscriptsから
自動検出も行います（`dev` → `start` → `serve` → `preview`の優先順）。検出できれば
保存され、以降の`record`/`build`でアプリが自動起動されるようになります。

```bash
demo-video-gen analyze [options]

Options:
  -c, --config <path>   設定ファイル（デフォルト: dvg.config.yaml）
  -u, --url <url>       対象URLを上書き（機能ごとのURL組み立てに使用。取得先ではありません）
  --dry-run
```

生成物: `.dvg/source-context.json`（決定論的処理の結果 — package.jsonの要約、README、
検出されたフレームワーク、発見済みルート）、`.dvg/project-summary.json`（AI生成の機能一覧）

### `scenario generate`
AIで `scenario.yaml`・`script.yaml`・`subtitles.srt` を生成します。`analyze`と同様、
スキーマ検証に失敗した場合は自動的にリトライします。

```bash
demo-video-gen scenario generate [options]

Options:
  -c, --config <path>   設定ファイル
  -t, --type <type>     動画タイプを上書き
  --force               既存ファイルを上書き
  --dry-run
```

生成物: `.dvg/scenario.yaml`、`.dvg/script.yaml`、`.dvg/subtitles.srt`

### `scenario validate`
`scenario.yaml` をスキーマに対して検証します。

```bash
demo-video-gen scenario validate [file]
```

### `record`
Playwrightでブラウザ操作を録画します。録画前に`target.url`への到達性を確認し、
到達できず`source.startCommand`が設定されていれば自動的に起動します
（`source.installDeps`がtrueなら先に依存関係をインストール）。起動確認は最大60秒待機します。

```bash
demo-video-gen record [options]

Options:
  -s, --scene <id>    特定のシーンのみ録画
  --headed            ブラウザ画面を表示しながら実行
  --slow-mo <ms>      各アクションを指定ミリ秒だけ遅延
  --dry-run
```

生成物: `.dvg/recordings/scene-<id>.mp4`

### `voice`
VOICEVOXでナレーション音声を合成します。

```bash
demo-video-gen voice [options]

Options:
  --speaker <id>      VOICEVOXの話者ID（デフォルト: 3）
  -s, --scene <id>    特定のシーンのみ合成
  --dry-run
```

生成物: `.dvg/voice/scene-<id>.wav`

### `render`
ffmpegで最終動画をレンダリングします。

```bash
demo-video-gen render [options]

Options:
  --no-subtitles    字幕オーバーレイをスキップ
  --no-voice        音声トラックをスキップ
  --preview         高速・低品質でレンダリング
  --ffmpeg <path>   使用するffmpegバイナリを上書き（デフォルトは自動バンドルされたもの）
  --dry-run         ffmpegコマンドを表示するのみで実行しない
```

生成物: `./output/final.mp4`

### `build`
全パイプラインをコマンド1つで実行します。

```bash
demo-video-gen build [options]

Options:
  -u, --url <url>       対象URL
  -t, --type <type>     動画タイプ
  --skip-analyze         解析をスキップ（既存のproject-summary.jsonを再利用）
  --skip-scenario         シナリオ生成をスキップ（既存のscenario.yamlを再利用）
  --skip-record            録画をスキップ（既存のmp4を再利用）
  --skip-voice              音声合成をスキップ（既存のwavを再利用）
  --preview                 高速レンダリング
  --headed                   録画中にブラウザ画面を表示
  --dry-run                   全ステップをドライラン
```

---

## 中間ファイル

`.dvg/` 配下のファイルはすべて人間が編集可能です。各ステップの間で自由に編集し、
好きな地点から再実行できます。

```
.dvg/
├── source-repo/            # source.repository のgit clone先（source.localPathの場合は無し）
├── source-context.json    # 決定論的処理: package.jsonの要約、README、検出フレームワーク、発見済みルート
├── project-summary.json   # AI: 機能抽出結果（各機能に実在するルートを紐付け）
├── scenario.yaml          # AI: シーン定義 + Playwright操作            ← 自由に編集可
├── script.yaml            # AI: ナレーションのタイミング                ← 自由に編集可
├── subtitles.srt          # 決定論的処理: script.yamlから自動生成       ← 自由に編集可
├── timeline.json          # 決定論的処理: レンダリング時に自動生成
├── recordings/            # Playwrightの録画出力（mp4）
├── voice/                 # VOICEVOXの音声ファイル（wav）
└── screenshots/            # 録画中に撮影したスクリーンショット
```

---

## 設定ファイル（`dvg.config.yaml`）

```yaml
project:
  name: "My App"

# AIが実際のプロジェクトを読み込む場所 — 以下の2つのうちどちらか一方
source:
  repository: "https://github.com/your-org/your-app.git"
  # ref: "main"                        # 任意。省略時はデフォルトブランチ
  # localPath: "../your-app"           # repository の代わりにこちらを使う場合
                                        # （既にローカルにチェックアウト済みのプロジェクト向け）
  # startCommand: "npm run dev"        # 未設定なら`analyze`が自動検出。
                                        # target.urlに到達できない場合に自動実行されます
  # installDeps: false                 # startCommand実行前に `npm install` を行うか
                                        # （フレッシュcloneの場合に便利）

# 実際にアプリが起動しているURL。Playwrightがここに対して録画します。
# source.startCommand が設定されていれば、到達できない場合に自動起動されます。
# 未設定の場合は自分で起動してください（例: npm run dev）。
target:
  url: "http://localhost:3000"
  type: "web"   # web | cli

video:
  type: "demo"          # teaser | shorts | demo | tutorial
  duration: 90
  resolution: "1920x1080"
  fps: 30
  language: "ja"

llm:
  provider: "gemini"    # gemini | openai | claude | groq | ollama
  model: "gemini-2.5-pro"
  # fallbackProvider: "ollama"
  # fallbackModel: "qwen2.5:7b-instruct"

voicevox:
  host: "http://localhost:50021"
  speakerId: 3

output:
  dir: "./output"
  workDir: "./.dvg"
```

サンプル設定は [`examples/dvg.config.yaml`](./examples/dvg.config.yaml) を参照してください
（Gemini単体・Ollama単体・併用の3パターンをコメントで併記しています）。

### ルート検出について

`analyze`は現時点で以下のフレームワークに対応した自動ルート検出を行います。

| フレームワーク | 検出方法 |
|---|---|
| Next.js App Router | `app/`（または`src/app/`）を走査し`page.{tsx,jsx,ts,js}`を検出。`api/`とルートグループ`(name)`は除外 |
| Next.js Pages Router | `pages/`（または`src/pages/`）を走査。`_app`/`_document`/`_error`/`api/`は除外 |
| それ以外 | 容量制限付きのファイル一覧にフォールバックし、AIがそこから推測します。**この場合`scenario.yaml`は生成後に必ず確認してください**（goto先URLが実在するルートに基づいていないため） |

Vite+ルーター設定、Vue Router、SvelteKitなど他のフレームワーク対応は、
`@demo-video-gen/source`の`inspector.ts`を拡張することで追加できます。

### プロジェクト種別の判定（platform）

`analyze`は、そのプロジェクトが**どんな種類**か（`web` / `ios` / `android` / `unity` /
`flutter` / `react-native` / `desktop` / `other`）も判定し、`.dvg/project-summary.json`と
`scenario.yaml`の`meta.platform`の両方に記録します。この判定は、実際のファイルに基づく
決定論的なシグナル（`Podfile`があればiOS、`build.gradle`/`AndroidManifest.xml`があれば
Android、`ProjectSettings/`があればUnity、`pubspec.yaml`があればFlutter、など —
`packages/source/src/inspector.ts`の`detectPlatformHints()`を参照）をpackage.json・READMEと
一緒にAIへ渡すことで、当て推量ではなく根拠のある判定にしています。

録画そのもの（Playwright）は現時点で`platform: web`のみ対応しています。
`scenario.yaml`がそれ以外のプラットフォーム向けに生成されていた場合、
`record`/`build`は**処理を止めずに警告だけ**表示します（そのプラットフォーム用の
録画実装がまだ存在しないため）。判定結果自体はどちらにしても記録されるので、
将来Android/iOS/Unity用の録画実装が追加された際にすぐ活用できます。

**新しいプラットフォームへの対応**は、意図的に1箇所に集約されています。
`packages/ai/src/pipeline/platform-classifier.ts`が`PLATFORM_DESCRIPTIONS`
（各プラットフォームの一行説明。LLMへの選択肢として提示されます）と
`buildPlatformClassificationPrompt()`（説明文と決定論的シグナルを組み合わせて
プロンプトのセクションを組み立てる関数）をエクスポートしています。新しい
プラットフォームを追加する手順:
1. `packages/core/src/types/config.ts`の`ProjectPlatformSchema`に追加
2. `PLATFORM_DESCRIPTIONS`に説明を追加
3. （推奨）`detectPlatformHints()`に決定論的なシグナル検出を追加

これ以外のコード変更は不要です — `analyzer.ts`と`scenario-generator.ts`は
返ってきた`platform`の値をそのまま使うだけです。

### LLMプロバイダー一覧

| プロバイダー | 環境変数 |
|----------|---------|
| `gemini` | `GEMINI_API_KEY` |
| `openai` | `OPENAI_API_KEY`（未実装、将来対応予定） |
| `claude` | `ANTHROPIC_API_KEY`（未実装、将来対応予定） |
| `groq`   | `GROQ_API_KEY`（未実装、将来対応予定） |
| `ollama` | 不要（`ollamaHost` で指定するローカルデーモン。デフォルト `http://localhost:11434`） |

APIキー等は `.env.example` をコピーして `.env` を作成し、そこに記入してください
（`Taskfile.yml` が `dotenv` 機能で自動的に読み込みます）。

```bash
cp .env.example .env
# .env を編集して GEMINI_API_KEY を設定
```

---

## 動画タイプ

| タイプ | 目安の長さ | 用途 |
|------|----------|------|
| `teaser` | 約30秒 | SNS向け・短時間で注意を引く |
| `shorts` | 約60秒 | YouTube Shorts / TikTok |
| `demo` | 約90秒 | 標準的なプロダクトデモ |
| `tutorial` | 約3〜5分 | ステップバイステップの解説 |

---

## 開発

```bash
git clone https://github.com/your-org/demo-video-gen
cd demo-video-gen
task install
task serve

# tsxで実行（初回・変更後は自動でビルドしてから実行されます）
pnpm dev -- init --repo https://github.com/your-org/your-app.git --url http://localhost:3000
# もしくは task 経由
task dev -- init --repo https://github.com/your-org/your-app.git --url http://localhost:3000
```

### プロジェクト構成

```
packages/
├── cli/          コマンド定義（Commander） + 実行ロジック（runners）
├── core/         共通の型定義（Zod）・スキーマ・ユーティリティ
│                 （バンドルされたffmpeg/ffprobeの自動検出ロジックも含む）
├── source/       決定論的なプロジェクト取り込み処理: gitクローン/ローカル読み込み、
│                 package.json・README読み込み、Webルート検出
├── ai/           LLMプロバイダー（Gemini / Ollama / ...） + AIパイプライン
├── playwright/   ブラウザ録画
├── voicevox/     音声合成
└── renderer/     ffmpegレンダリング

scripts/
└── doctor.ts     環境診断スクリプト（tsxで実行、`task doctor`の実体）
                  ※ これ以外の処理（インストール・サーバー起動・OS判定等）は
                    すべて Taskfile.yml に直接記述しています。個別スクリプトに
                    ラップするとメンテナンスコストが増えるため、Task組み込みの
                    {{OS}}変数・platforms:・status: 等で完結させています。

Taskfile.yml      環境構築・サーバー起動の唯一の入り口
```

---

## トラブルシューティング

### `pnpm install` が失敗する（ffmpegやtaskのダウンロードでエラー）

`ffmpeg-static` や `@go-task/cli` はバイナリをGitHubリリースからダウンロードするpostinstall
スクリプトを持っており、社内プロキシ等でこれらのダウンロードがブロックされると
`pnpm install` 自体が失敗することがあります。対処法:

1. まずは再実行してみてください（一時的なネットワークエラーのことが多いです）
2. ffmpegはシステムに手動でインストールしても構いません（自動的に検出されます）
   ```bash
   # Windows
   winget install ffmpeg
   # macOS
   brew install ffmpeg
   # Linux (Debian/Ubuntu)
   sudo apt install ffmpeg
   ```
3. `task` バイナリの取得に失敗する場合は [公式のインストール方法](https://taskfile.dev/installation/)
   （Scoop / Homebrew / バイナリ直接ダウンロード等）で別途インストールしてください

### `pnpm run build` や `pnpm dev` が `ERR_PNPM_IGNORED_BUILDS` で失敗する

pnpmはセキュリティ上の理由から、依存パッケージのpostinstall/buildスクリプトを
デフォルトでブロックします。未承認のスクリプトが1つでも残っていると、
`pnpm run` 系のコマンドがすべて失敗します。以下を実行してください。

```bash
pnpm approve-builds
```

対話形式で承認するパッケージを選べます（`ffmpeg-static` / `@go-task/cli` / `esbuild`
を選択してください）。このリポジトリの `pnpm-workspace.yaml` にはすでに
`allowBuilds` として承認済みの設定が入っていますが、pnpmのバージョンや環境によっては
再承認が必要になる場合があります。

### `demo-video-gen init` が「--repo か --source が必要」と言ってエラーになる

`analyze`は実際のプロジェクトソースコードを読み込む設計のため、`init`の時点で
解析対象のgitプロジェクトを指定する必要があります。

```bash
demo-video-gen init --repo https://github.com/user/repo.git --url http://localhost:3000
# または
demo-video-gen init --source ../my-local-project --url http://localhost:3000
```

`--source`に指定したパスがgitリポジトリでない場合もエラーになります（`git init`されている
必要があります）。

### `scenario.yaml`のURLが実際のページと合っていない

対象フレームワークで自動ルート検出が効いていない可能性があります。
`.dvg/source-context.json`を開いて`framework`と`routes`を確認してください。
`routes`が空の場合、AIはファイル一覧から推測しているため精度が落ちます。
現時点で自動検出に対応しているのはNext.js（App Router / Pages Router）のみです。
それ以外のフレームワークの場合は、生成された`scenario.yaml`の`goto`アクションを
手動で修正してから`record`を実行してください。

### VOICEVOXに接続できない

`task serve` を実行済みか確認してください。Dockerが必要です
（`docker --version` で確認できます）。`docker logs dvg-voicevox` でコンテナのログを
確認できます。

### Ollamaに接続できない・モデルが見つからない

```bash
ollama serve                        # デーモンを起動
ollama pull qwen2.5:7b-instruct     # モデルを取得（localプロファイルの場合）
ollama list                         # 取得済みモデルを確認
```

`task doctor` を実行すると、上記も含めた環境全体の状態をまとめて確認できます。

### とにかく何もわからない場合

```bash
task doctor
```

を実行してください。何が足りていないかがチェックリスト形式で表示され、
それぞれに対処コマンドが添えられています。

---

## ライセンス

MIT
