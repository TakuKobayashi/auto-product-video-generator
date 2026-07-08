# demo-video-gen

AI-powered promotional video generator for web apps and CLI tools.

- **AI generates** the scenario, narration, subtitles, and timeline (YAML/JSON)
- **Deterministic tools** handle recording (Playwright), voice (VOICEVOX), and rendering (ffmpeg)
- Every intermediate file is human-editable before the next step
- **Local-first LLM**: run fully offline with Ollama, use Gemini, or combine both (automatic fallback)
- Environment setup and local services are unified into one command each via [`Taskfile.yml`](./Taskfile.yml)

---

## Quick Start

```bash
# 1. Clone & enter the project
git clone <this-repo>
cd demo-video-gen

# 2. Install EVERYTHING: Node deps, ffmpeg/ffprobe (bundled automatically),
#    Playwright's Chromium, and (optionally) Ollama + a local LLM model.
task install

# 3. Start every local service (VOICEVOX Engine via Docker, Ollama daemon).
task serve

# 4. Not sure everything is set up correctly? Check:
task doctor

# 5. Generate a video
pnpm dev -- init --url http://localhost:3000
pnpm dev -- build
```

Don't have `task` yet? See [Task's installation guide](https://taskfile.dev/installation/)
(it's also installed automatically as part of `pnpm install`, via the devDependency
`@go-task/cli`). `package.json` also has `pnpm run setup` / `pnpm run serve` /
`pnpm run doctor` aliases that just call the same `task` commands underneath.

The final video lands at `./output/final.mp4`.

> New to this project and not sure how any of this works? Run `task doctor`
> for a checklist of what's missing, or `task --list` to see every available
> command (descriptions are in Japanese — see [`README-ja.md`](./README-ja.md)
> for the full Japanese docs).

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | |
| pnpm | ≥ 9 | `corepack enable` gives you this for free |
| [Task](https://taskfile.dev) | ≥ 3 | auto-installed via `pnpm install` (devDependency `@go-task/cli`); can also be installed manually |
| ffmpeg / ffprobe | — | **bundled automatically** via `ffmpeg-static` / `ffprobe-static`, no manual install needed |
| Playwright (Chromium) | — | installed by `task install` |
| Docker | any recent | needed to run VOICEVOX Engine (`task serve`) |
| Ollama | optional | needed only if you want a fully local/offline LLM (`task install` sets this up too) |

---

## Tasks

`Taskfile.yml` is the single entry point for setup and service orchestration.
It's intentionally just the real commands laid out in sequence — OS branching
uses Task's built-in `{{OS}}` variable (linux/darwin/windows), skip-if-done
logic uses `status:`, and there's no wrapper script hiding what actually runs
(keeps maintenance cost low).

| Task | What it does |
|---|---|
| `task install` | Runs `install:node` → `install:playwright` → `install:ollama` in order |
| `task install:node` | `pnpm install` (also triggers the ffmpeg-static/ffprobe-static downloads) |
| `task install:playwright` | Installs Chromium (+ best-effort OS deps on Linux) |
| `task install:ollama` | Installs the Ollama binary + pulls the model for `PROFILE` (skipped if `WITH_OLLAMA=false`) |
| `task serve` | Runs `serve:voicevox` → `serve:ollama` in order |
| `task serve:voicevox` | Starts VOICEVOX Engine via Docker and waits for it to be healthy (skipped if already running) |
| `task serve:ollama` | Starts `ollama serve` in the background and waits for it to be healthy (skipped if `WITH_OLLAMA=false` or already running) |
| `task stop` | Stops the VOICEVOX container started by `task serve` |
| `task doctor` | Environment diagnostics (runs `scripts/doctor.ts` via tsx) |
| `task build` | Builds all packages |
| `task dev -- <args>` | Runs the CLI directly without building |
| `task quickstart` | `install` + `serve`, then prints next steps |

`PROFILE` (`local` default / `ci`) and `WITH_OLLAMA` (`true` default / `false`)
can be combined freely:

```bash
task install PROFILE=local WITH_OLLAMA=true    # dev machine, full local LLM
task install PROFILE=ci WITH_OLLAMA=false      # CI, Gemini API only
task serve PROFILE=local WITH_OLLAMA=true
```

### `package.json` aliases

| `pnpm run` | Underlying command |
|---|---|
| `pnpm run setup` | `task install` |
| `pnpm run setup:full` | `task install PROFILE=local WITH_OLLAMA=true` |
| `pnpm run setup:cloud-only` | `task install PROFILE=local WITH_OLLAMA=false` |
| `pnpm run setup:ci` | `task install PROFILE=ci WITH_OLLAMA=true` |
| `pnpm run serve` | `task serve` |
| `pnpm run serve:stop` | `task stop` |
| `pnpm run doctor` | `task doctor` |

(`pnpm run build` / `pnpm run dev` / `pnpm run clean` remain the real
implementations — `tsc -b`, `tsx`, etc. — since `task build` / `task dev` call
*into* them; replacing them the other way around would be circular.)

---

## Local LLM (Ollama) — used together with Gemini

`dvg.config.yaml`'s `llm` section supports:

- **`provider: gemini`** — cloud, needs `GEMINI_API_KEY`, highest quality.
- **`provider: ollama`** — fully local/offline, no API key, no network.
- **`fallbackProvider`** — automatically fall back to a second provider if the
  primary one fails (offline, rate-limited, model not pulled, invalid JSON, etc).
  This lets Ollama and Gemini be used *together*, in either priority order.
  The fallback provider is only constructed when it's actually needed, so
  e.g. running with `provider: ollama` doesn't require `GEMINI_API_KEY` to be
  set at all unless Ollama actually fails.

`demo-video-gen init` picks a sensible default automatically: if
`GEMINI_API_KEY` is set when you run `init`, it defaults to
`provider: gemini` with `fallbackProvider: ollama`; if it's not set, it
defaults to `provider: ollama` with `fallbackProvider: gemini` instead — so a
fresh project works out of the box with whatever you actually have available,
without needing to hand-edit `dvg.config.yaml` first. You can always change
either provider afterwards.

```yaml
llm:
  provider: "ollama"
  model: "qwen2.5:7b-instruct"
  fallbackProvider: "gemini"
  fallbackModel: "gemini-2.5-pro"
```

### Model selection by machine profile

`task install` / `task serve` accept a `PROFILE` to pick a model sized for the
target machine (see the `vars:` block in `Taskfile.yml`). Both are
Qwen2.5-Instruct (chosen for reliable JSON-schema output, which the `analyze`
/ `scenario generate` pipelines require):

| Profile | Model | Why |
|---|---|---|
| `local` (e.g. Ryzen 7 5800H / 64GB RAM / RTX 3050 Ti 4GB) | `qwen2.5:7b-instruct` | ~4.7GB (Q4_K_M), good quality, fits with partial GPU offload |
| `ci` (GitHub Actions hosted runners) | `qwen2.5:3b-instruct` | ~1.9GB (Q4_K_M), CPU-only friendly, fits within job time limits |

---

## Commands (CLI)

### `init`
Initialize a project config (`dvg.config.yaml`).

```bash
demo-video-gen init [directory] [options]

Options:
  -u, --url <url>     Target application URL
  -t, --type <type>   Video type: teaser|shorts|demo|tutorial (default: demo)
  -n, --name <name>   Project name
  --force              Overwrite an existing dvg.config.yaml
  --dry-run           Preview config without writing
```

### `analyze`
Analyze the target URL with AI and extract features.

```bash
demo-video-gen analyze [options]

Options:
  -c, --config <path>   Config file (default: dvg.config.yaml)
  -u, --url <url>       Override target URL
  --dry-run
```

Produces: `.dvg/project-summary.json`

### `scenario generate`
Generate `scenario.yaml`, `script.yaml`, and `subtitles.srt` with AI.

```bash
demo-video-gen scenario generate [options]

Options:
  -c, --config <path>   Config file
  -t, --type <type>     Override video type
  --force               Overwrite existing files
  --dry-run
```

Produces: `.dvg/scenario.yaml`, `.dvg/script.yaml`, `.dvg/subtitles.srt`

### `scenario validate`
Validate a `scenario.yaml` against the schema.

```bash
demo-video-gen scenario validate [file]
```

### `record`
Record browser interactions with Playwright.

```bash
demo-video-gen record [options]

Options:
  -s, --scene <id>    Record a specific scene only
  --headed            Show browser window
  --slow-mo <ms>      Slow down each action
  --dry-run
```

Produces: `.dvg/recordings/scene-<id>.mp4`

### `voice`
Synthesize narration audio with VOICEVOX.

```bash
demo-video-gen voice [options]

Options:
  --speaker <id>      VOICEVOX speaker ID (default: 3)
  -s, --scene <id>    Synthesize a specific scene only
  --dry-run
```

Produces: `.dvg/voice/scene-<id>.wav`

### `render`
Render the final video with ffmpeg.

```bash
demo-video-gen render [options]

Options:
  --no-subtitles    Skip subtitle overlay
  --no-voice        Skip voice audio
  --preview         Fast low-quality render
  --ffmpeg <path>   Override the ffmpeg binary (defaults to the bundled one)
  --dry-run         Print ffmpeg command only
```

Produces: `./output/final.mp4`

### `build`
Run the full pipeline in one command.

```bash
demo-video-gen build [options]

Options:
  -u, --url <url>       Target URL
  -t, --type <type>     Video type
  --skip-analyze        Skip analyze (reuse project-summary.json)
  --skip-scenario       Skip scenario generation (reuse scenario.yaml)
  --skip-record         Skip recording (reuse existing mp4s)
  --skip-voice          Skip voice synthesis (reuse existing wav)
  --preview             Fast render
  --headed              Show browser during recording
  --dry-run             Dry-run all steps
```

---

## Intermediate Files

All files under `.dvg/` are human-editable. Edit them between steps and re-run from any point.

```
.dvg/
├── project-summary.json   # AI: feature extraction
├── scenario.yaml          # AI: scene definitions + Playwright actions  ← edit freely
├── script.yaml            # AI: narration timing                        ← edit freely
├── subtitles.srt          # deterministic: generated from script.yaml   ← edit freely
├── timeline.json          # deterministic: generated at render time
├── recordings/            # Playwright output mp4s
├── voice/                 # VOICEVOX wav files
└── screenshots/           # screenshots taken during recording
```

---

## Configuration (`dvg.config.yaml`)

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

See [`examples/dvg.config.yaml`](./examples/dvg.config.yaml) for a fuller
example with Gemini-only / Ollama-only / combined configurations commented in.

### LLM Providers

| Provider | Env var |
|----------|---------|
| `gemini` | `GEMINI_API_KEY` |
| `openai` | `OPENAI_API_KEY` (not yet implemented) |
| `claude` | `ANTHROPIC_API_KEY` (not yet implemented) |
| `groq`   | `GROQ_API_KEY` (not yet implemented) |
| `ollama` | none (local daemon at `ollamaHost`, default `http://localhost:11434`) |

Copy `.env.example` to `.env` and fill in what you need (`Taskfile.yml` loads
it automatically via its `dotenv` config):

```bash
cp .env.example .env
```

---

## Video Types

| Type | Duration | Use case |
|------|----------|----------|
| `teaser` | ~30s | SNS / quick attention |
| `shorts` | ~60s | YouTube Shorts / TikTok |
| `demo` | ~90s | Standard product demo |
| `tutorial` | ~3–5min | Step-by-step walkthrough |

---

## Development

```bash
git clone https://github.com/your-org/demo-video-gen
cd demo-video-gen
task install
task serve

# Run directly with tsx (no build required)
pnpm dev -- init --url http://localhost:3000
# or via task
task dev -- init --url http://localhost:3000
```

### Project Structure

```
packages/
├── cli/          Commands (Commander) + runners
├── core/         Shared types (Zod), schemas, utils (incl. bundled ffmpeg/ffprobe resolution)
├── ai/           LLM providers (Gemini/Ollama/...) + AI pipelines
├── playwright/   Browser recording
├── voicevox/     Voice synthesis
└── renderer/     ffmpeg rendering

scripts/
└── doctor.ts     Environment diagnostics (run via tsx, `task doctor`'s implementation)
                  Everything else (install steps, serving, OS branching) lives
                  directly in Taskfile.yml — wrapping it in scripts would just
                  add another layer to maintain, and Task's built-in {{OS}}
                  variable / platforms: / status: fields already cover it.

Taskfile.yml      The single entry point for environment setup & services
```

---

## Troubleshooting

- **`pnpm install` fails downloading ffmpeg/task binaries** — usually a blocked
  GitHub release download (corporate proxy, flaky network). Retry, or install
  ffmpeg via your OS package manager (it's picked up automatically); install
  `task` manually via https://taskfile.dev/installation/ if needed.
- **`pnpm run build` / `pnpm dev` fails with `ERR_PNPM_IGNORED_BUILDS`** — run
  `pnpm approve-builds` and approve `ffmpeg-static`, `@go-task/cli`, `esbuild`.
- **Can't reach VOICEVOX** — make sure `task serve` was run and Docker is
  installed; check `docker logs dvg-voicevox`.
- **Can't reach Ollama / model not found** — `ollama serve`, then
  `ollama pull qwen2.5:7b-instruct` (or the `ci` profile's model).
- **Not sure what's wrong at all** — run `task doctor` for a full checklist.

See [`README-ja.md`](./README-ja.md) for a more detailed (Japanese) version of
this section.

---

## License

MIT
