# demo-video-gen

Webアプリ・CLIツール向けのAIプロモーション動画自動生成ツールです。

- **AIが担当するのは** シナリオ・ナレーション・字幕・タイムラインの生成（YAML/JSON）のみ
- **録画（Playwright）・音声合成（VOICEVOX）・動画合成（ffmpeg）は決定論的なツールが担当**
- 各ステップの中間ファイルはすべて人間が編集可能
- **ローカルLLMファースト**: Ollamaで完全オフライン実行、Geminiクラウド、あるいは両方を併用（自動フォールバック）も可能
- 環境構築・サーバー起動は [`Taskfile.yml`](./Taskfile.yml) にコマンド1つずつで集約

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

# 5. 動画を生成する
pnpm dev -- init --url http://localhost:3000
pnpm dev -- build
```

`task` コマンドが手元に無い場合は、まず [Taskのインストール方法](https://taskfile.dev/installation/)
を参照してください（`pnpm install` で入る `@go-task/cli` からも自動的に使えるようになります）。
`package.json` にも `pnpm run setup` / `pnpm run serve` / `pnpm run doctor` という
同じ内容のエイリアスを用意しています（内部では `task install` 等をそのまま呼んでいます）。

生成された動画は `./output/final.mp4` に出力されます。

> 「そもそもどう動かせばいいかわからない」という場合は、まず `task doctor` を実行してみてください。
> 何が足りていないかをチェックリスト形式で表示します。
> 利用可能な全タスクは `task --list` で確認できます（各タスクの説明は日本語で書かれています）。

---

## 必要な環境

| ツール | バージョン | 備考 |
|------|---------|-------|
| Node.js | ≥ 20 | |
| pnpm | ≥ 9 | `corepack enable` で導入できます |
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
| `task dev -- <args>` | CLIをビルドなしで直接実行 |
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
逆方向には置き換えていません。）

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

`demo-video-gen init` は実行時点の環境を見て賢くデフォルトを選びます。`init`実行時に
`GEMINI_API_KEY` が設定されていれば `provider: gemini` + `fallbackProvider: ollama`、
設定されていなければ `provider: ollama` + `fallbackProvider: gemini` になります。
つまり、`dvg.config.yaml` を手で編集しなくても、今すぐ使えるものでそのまま動く状態が
初期状態から得られます。もちろん後からどちらの設定も自由に変更できます。

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

### マシンスペックによるモデルの使い分け

`task install` / `task serve` は `PROFILE` 引数によって、実行するマシンに適したモデルを
自動的に選択します（定義は `Taskfile.yml` の `vars:` に集約されています）。

「AIの役割」（プロジェクト解析・シナリオ生成・ナレーション生成など、いずれも**厳密なJSON出力**が
求められるタスク）に適したモデルとして、指示追従性とJSON出力の安定性に定評のある
**Qwen2.5-Instruct** シリーズを採用し、可能な限り同じモデルファミリーに揃えています。

| プロファイル | モデル | 選定理由 |
|---|---|---|
| `local`（例: Ryzen 7 5800H / 64GB RAM / RTX 3050 Ti 4GB VRAM） | `qwen2.5:7b-instruct` | 約4.7GB（Q4_K_M量子化）。4GB VRAMでも部分的にGPUオフロードでき、64GBのRAMがあれば残りのレイヤーをCPU側で処理しても十分な速度が出ます。JSON出力の安定性も高く、`AIの役割`を担うのに適したバランス |
| `ci`（GitHub Actions ホステッドランナー） | `qwen2.5:3b-instruct` | 約1.9GB（Q4_K_M量子化）。GPUのないCPUのみの環境（2コア・RAM 7GB程度）でもジョブの時間制限内に収まる軽量さを優先。同じQwen2.5-Instructファミリーのため、挙動の一貫性はできるだけ保っています |

> **補足:** GitHub Actionsのホステッドランナーは標準でGPUを搭載しておらず、メモリも
> 限られているため、`local`と全く同じ7Bモデルを使うと、モデルのダウンロード時間・
> 推論速度の両面でジョブがタイムアウトするリスクが高くなります。そのため
> `ci` プロファイルではモデルサイズを落としていますが、同一ファミリー・同一の
> instructionチューニング方針のモデルを選んでいるため、生成されるJSONの構造や
> 傾向は概ね揃います。もし大きめのセルフホストランナーを使う場合は
> `task install PROFILE=local` を指定すれば7Bモデルも利用できます。

---

## コマンド一覧（CLI本体）

### `init`
プロジェクト設定ファイル（`dvg.config.yaml`）を初期化します。

```bash
demo-video-gen init [directory] [options]

Options:
  -u, --url <url>     対象アプリケーションのURL
  -t, --type <type>   動画タイプ: teaser|shorts|demo|tutorial（デフォルト: demo）
  -n, --name <name>   プロジェクト名
  --force              既存の dvg.config.yaml を上書き
  --dry-run           ファイルを書き込まずプレビューのみ
```

### `analyze`
対象URLをAIで解析し、機能を抽出します。

```bash
demo-video-gen analyze [options]

Options:
  -c, --config <path>   設定ファイル（デフォルト: dvg.config.yaml）
  -u, --url <url>       対象URLを上書き
  --dry-run
```

生成物: `.dvg/project-summary.json`

### `scenario generate`
AIで `scenario.yaml`・`script.yaml`・`subtitles.srt` を生成します。

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
Playwrightでブラウザ操作を録画します。

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
├── project-summary.json   # AI: 機能抽出結果
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

# tsxで直接実行（ビルド不要）
pnpm dev -- init --url http://localhost:3000
# もしくは task 経由
task dev -- init --url http://localhost:3000
```

### プロジェクト構成

```
packages/
├── cli/          コマンド定義（Commander） + 実行ロジック（runners）
├── core/         共通の型定義（Zod）・スキーマ・ユーティリティ
│                 （バンドルされたffmpeg/ffprobeの自動検出ロジックも含む）
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
