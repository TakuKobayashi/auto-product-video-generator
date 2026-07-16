# demo-video-gen

AI-powered promotional video generator for web apps and CLI tools.

- **`analyze` reads the actual project** — clones a git repo (or reads an existing
  local checkout), then has AI read its `package.json`, README, and (for supported
  frameworks) real discovered page routes to build a recording plan. It does not
  guess based on a URL alone.
- **AI generates** the scenario, narration, subtitles, and timeline (YAML/JSON) —
  grounded in that real source, not invented from scratch
- **Deterministic tools** handle git cloning/route discovery, recording (Playwright),
  voice (VOICEVOX), and rendering (ffmpeg)
- Every intermediate file is human-editable before the next step
- **Local-first LLM**: run fully offline with Ollama, use Gemini, or combine both (automatic fallback)
- Environment setup and local services are unified into one command each via [`Taskfile.yml`](./Taskfile.yml)
- `analyze` classifies the project's platform (web/ios/android/unity/flutter/react-native/desktop/other)
  and records it in `scenario.yaml`. Recording itself (Playwright) is web-only for now — other
  platforms are detected and recorded, just not recordable yet.

---

## How it works

```
1. init      --repo <git-url>  OR  --source <local-path>   (must be a git project)
                    │
                    ▼
2. analyze   git clone (or use local checkout) → read package.json/README →
             discover real page routes (Next.js App/Pages Router; generic
             file listing fallback for other frameworks) + platform signals
             (Podfile, build.gradle, pubspec.yaml, ...) → AI classifies the
             platform (web/ios/android/unity/...) and turns this into
             project-summary.json (features, each anchored to a real route)
                    │
                    ▼
3. scenario generate   AI turns project-summary.json + real routes into
                        scenario.yaml (a recording plan: which URLs to visit,
                        what to click) + script.yaml (narration) + subtitles.srt
                    │
                    ▼
4. record    Playwright executes scenario.yaml's plan against `target.url`
             (your app must actually be running there — this tool doesn't
             start it for you)
                    │
                    ▼
5. voice / render   VOICEVOX narration + ffmpeg compositing → output/final.mp4
```

`scenario.yaml` is the actual "recording execution plan" — human-editable between
steps 3 and 4, same as every other intermediate file.

LLM calls print a heartbeat ("... still working, Ns elapsed") every few
seconds so a slow local model doesn't look like the command has frozen. If
the LLM's JSON response doesn't match the expected schema, the exact
validation errors are fed back to it automatically (up to 2 retries) before
giving up with a readable error.

---

## Quick reference

Every step above is its own command, each reading/writing files under
`.dvg/` — so you can run the whole thing with `build`, or run each step by
hand and resume from any point (e.g. after hand-editing `scenario.yaml`,
just re-run from `record` onward; no need to re-analyze or regenerate it).

| # | Command | Reads | Produces |
|---|---|---|---|
| 1 | `demo-video-gen init --repo <url>` (or `--source <path>`) | — | `dvg.config.yaml` |
| 2 | `demo-video-gen analyze` | the cloned/local project | `.dvg/source-context.json`, `.dvg/project-summary.json` |
| 3 | `demo-video-gen scenario generate` | `.dvg/project-summary.json` | `.dvg/scenario.yaml`, `.dvg/script.yaml`, `.dvg/subtitles.srt` |
| 4 | `demo-video-gen record` | `.dvg/scenario.yaml` (runs its `setup` plan first if needed) | `.dvg/recordings/*.mp4` |
| 5 | `demo-video-gen voice` | `.dvg/script.yaml` | `.dvg/voice/*.wav` |
| 6 | `demo-video-gen render` | recordings + voice + `.dvg/scenario.yaml` | `output/final.mp4` |

`demo-video-gen build` runs 2–6 in one command. Use `--skip-analyze` /
`--skip-scenario` / `--skip-record` / `--skip-voice` to resume partway
through (each skip flag reuses that step's existing output instead of
regenerating it) — e.g. `demo-video-gen build --skip-analyze --skip-scenario`
re-records + re-renders using an already-generated `scenario.yaml` you
hand-edited, without touching the source or calling the LLM again.

Full option reference for each command is in the "Commands (CLI)" section below.

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

# 5. Point it at the project you want a video for (a git repo — remote or local),
#    and the URL where that app will actually be running (start it yourself,
#    e.g. `npm run dev` in another terminal, before step 7).
pnpm dev -- init --repo https://github.com/your-org/your-app.git --url http://localhost:3000
# or, for a project you already have checked out locally:
# pnpm dev -- init --source ../your-app --url http://localhost:3000

# 6. Make sure the app is actually running at the --url you gave above.

# 7. Generate the video
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
| git | any recent | required — `analyze` clones/reads real project source with it |
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

### Different models per task

`analyze` (mostly extraction/classification from source + README) and
`scenario generate` (structured multi-scene JSON with actions, timing, and a
setup plan) are quite different tasks — a model that's fine for one can
struggle with the other, especially smaller local models on the harder
`scenario generate` output. `llm.tasks` lets you use a different
provider/model for each, falling back to the top-level `provider`/`model`/
`apiKeyEnv` for whatever isn't overridden:

```yaml
llm:
  provider: "ollama"
  model: "qwen2.5:7b-instruct"    # used for analyze (and anything not overridden)
  fallbackProvider: "gemini"
  fallbackModel: "gemini-2.5-pro"
  tasks:
    scenario:
      provider: "gemini"           # use the stronger cloud model just for
      model: "gemini-2.5-pro"      # scenario generation, keep analyze local
    # analyze:
    #   model: "qwen2.5:3b-instruct"  # or: use an even smaller/faster model
    #                                  # for analyze specifically
```

If `scenario generate` keeps failing schema validation (check the retry
warnings it prints — they show exactly which fields the model got wrong),
that's a sign the current model isn't a great fit for that task specifically;
pointing `llm.tasks.scenario` at a stronger model (a bigger local model, or
Gemini) usually resolves it without needing to change what's used for
`analyze`. Both `analyze` and `build` print which provider/model is actually
being used for each task at the start, so you can confirm the override took
effect.

---

## Commands (CLI)

### `init`
Initialize a project config (`dvg.config.yaml`), pointing at the project source
to analyze — required, since `analyze` reads real source, not just a URL.

```bash
demo-video-gen init [directory] [options]

Options:
  --repo <url>         Git repository URL to clone and analyze
                        (exactly one of --repo / --source is required)
  --source <path>       Path to an existing local git project to analyze
  --ref <ref>            Git branch/tag/commit to check out with --repo
                          (default: the repository's default branch)
  --serve-command <cmd>   Command to auto-start the app's dev server (e.g.
                           "npm run dev"). If omitted, `analyze` tries to
                           detect one from package.json and saves it for you.
  --install-deps           Run `npm install` in the source before starting
                            the dev server (useful for a fresh clone)
  -u, --url <url>          URL where the app can be reached once running
                            (default: http://localhost:3000). Optional — every
                            command that uses it (analyze/record/build) also
                            accepts its own -u/--url, which overrides whatever
                            is saved in dvg.config.yaml for that one run.
  -t, --type <type>   Video type: teaser|shorts|demo|tutorial (default: demo)
  -n, --name <name>   Project name (default: derived from the source directory name)
  --force              Overwrite an existing dvg.config.yaml
  --dry-run           Preview config without writing
```

**Starting the app**: `record`/`build` start the app automatically whenever
`target.url` isn't already reachable, preferring `scenario.yaml`'s AI-generated
`setup` plan (see "Setup plan" below — this is filled in by `analyze`, not
`init`). `--serve-command` here just sets `source.startCommand` as a manual
fallback/override, used only when `scenario.yaml` has no `setup` steps yet
(e.g. before you've run `analyze`). Either way, if nothing is configured and
the URL isn't reachable, you'll get a clear warning telling you to start it
manually.

### `analyze`
Resolves the project source (clones `source.repository`, or verifies
`source.localPath` is a git repo) and inspects it deterministically — reads
`package.json` and `README.md`, and for Next.js projects (App or Pages
Router) discovers real page routes by walking `app/`/`pages/`. Other
frameworks fall back to a capped file listing. That context (plus
deterministic platform signals — `Podfile`, `build.gradle`, `pubspec.yaml`,
etc.) is then handed to AI, which classifies the project's `platform`,
plans an ordered `setupSteps` list for getting it running, and extracts
demoable features, each anchored to a real route where possible. If the
LLM's JSON response doesn't match the expected schema, the errors are fed
back to it and it gets up to 2 retries before failing.

If `dvg.config.yaml` doesn't already have `source.startCommand` set, this
also detects one from package.json's scripts (`dev` → `start` → `serve` →
`preview`, in that order) and saves it as a fallback for older/manual
scenarios — but the AI-generated `setupSteps` above (see "Setup plan") is
what `record`/`build` actually prefer.

```bash
demo-video-gen analyze [options]

Options:
  -c, --config <path>   Config file (default: dvg.config.yaml)
  -u, --url <url>       Override target URL (used to build feature URLs, not to fetch from)
  --dry-run
```

Produces: `.dvg/source-context.json` (deterministic — package.json summary,
README, detected framework, discovered routes), `.dvg/project-summary.json`
(AI-generated feature list)

### `scenario generate`
AI generates `scenario.yaml` (the recording plan — scenes, actions, and the
`setup` startup plan). Same retry-on-validation-failure behavior as
`analyze`. `script.yaml` and `subtitles.srt` are then derived *deterministically*
from `scenario.yaml`'s narration text (no second LLM call) — narration timing
is estimated from text length, so the two files can never disagree with each
other.

```bash
demo-video-gen scenario generate [options]

Options:
  -c, --config <path>   Config file
  -t, --type <type>     Override video type
  --force               Overwrite existing files
  --dry-run
```

Produces: `.dvg/scenario.yaml` (AI), `.dvg/script.yaml` (deterministic),
`.dvg/subtitles.srt` (deterministic)

### `scenario validate`
Validate a `scenario.yaml` against the schema.

```bash
demo-video-gen scenario validate [file]
```

### `record`
Record browser interactions with Playwright. Before recording, checks if
`target.url` is reachable; if not and `source.startCommand` is set, starts it
automatically (installing deps first if `source.installDeps` is true) and
waits up to 60s for it to come up.

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
├── source-repo/            # git clone of source.repository (skipped for source.localPath)
├── source-context.json    # deterministic: package.json summary, README, detected
│                           # framework, discovered routes
├── project-summary.json   # AI: feature extraction (each anchored to a real route)
├── scenario.yaml          # AI: setup plan + scene definitions + Playwright actions  ← edit freely
├── script.yaml            # deterministic: narration timing derived from scenario.yaml ← edit freely
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

# Where AI reads the actual project from — exactly one of these two:
source:
  repository: "https://github.com/your-org/your-app.git"
  # ref: "main"                        # optional; defaults to the default branch
  # localPath: "../your-app"           # use this instead of `repository`
                                        # for an already-checked-out project
  # startCommand: "npm run dev"        # auto-detected by `analyze` if unset;
                                        # run automatically when target.url
                                        # isn't already reachable
  # installDeps: false                 # run `npm install` before startCommand
                                        # (useful for a fresh clone)

# Where the running app can be reached, so Playwright can record it.
# If source.startCommand is set, it's started automatically when this isn't
# reachable yet; otherwise start it yourself (e.g. `npm run dev`).
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
  # tasks:               # optional per-task override — see "Different models per task" above
  #   scenario:
  #     provider: "gemini"
  #     model: "gemini-2.5-pro"

voicevox:
  host: "http://localhost:50021"
  speakerId: 3

output:
  dir: "./output"
  workDir: "./.dvg"
```

See [`examples/dvg.config.yaml`](./examples/dvg.config.yaml) for a fuller
example with Gemini-only / Ollama-only / combined configurations commented in.

### Route discovery

`analyze` currently discovers real routes automatically for:

| Framework | How |
|---|---|
| Next.js App Router | walks `app/` (or `src/app/`) for `page.{tsx,jsx,ts,js}` files, skips `api/` and route groups `(name)` |
| Next.js Pages Router | walks `pages/` (or `src/pages/`), skips `_app`/`_document`/`_error`/`api/` |
| anything else | falls back to a capped source file listing; the AI infers likely routes from it — **review `scenario.yaml` carefully in this case**, since goto URLs aren't grounded in a real route |

More frameworks (Vite + a router config, Vue Router, SvelteKit, etc.) are a
natural place to extend `@demo-video-gen/source`'s `inspector.ts`.

### Platform classification

`analyze` also classifies what *kind* of project this is — `web`, `ios`,
`android`, `unity`, `flutter`, `react-native`, `desktop`, or `other` — and
records it as `platform` in both `.dvg/project-summary.json` and
`scenario.yaml`'s `meta.platform`. This is grounded by deterministic
file-based signals (`Podfile` → iOS, `build.gradle`/`AndroidManifest.xml` →
Android, `ProjectSettings/` → Unity, `pubspec.yaml` → Flutter, etc. — see
`detectPlatformHints()` in `packages/source/src/inspector.ts`), which are
passed to the AI alongside package.json/README so it isn't guessing blind.

Recording itself (Playwright) currently only supports `platform: web` —
`record`/`build` print a warning (without blocking) if `scenario.yaml` was
generated for anything else, since no recorder for that platform exists yet.
The classification is still recorded either way, so the scenario file is
future-proofed for when other recorders (Android/iOS/Unity) are added.

**Extending this to a new platform** is deliberately isolated to one place:
`packages/ai/src/pipeline/platform-classifier.ts` exports
`PLATFORM_DESCRIPTIONS` (a one-line description per platform, shown to the
LLM as its classification options) and `buildPlatformClassificationPrompt()`
(assembles that + the deterministic hints into a prompt section). To add a
platform:
1. Add it to `ProjectPlatformSchema` in `packages/core/src/types/config.ts`
2. Add a description for it to `PLATFORM_DESCRIPTIONS`
3. (Recommended) add a deterministic hint for it in `detectPlatformHints()`

No other code needs to change — `analyzer.ts` and `scenario-generator.ts`
just read whatever `platform` value comes back.

### Setup plan (`scenario.yaml`'s `setup` field)

`analyze` also has the AI generate a Taskfile-like ordered list of shell
commands for getting the project from a fresh checkout to actually running —
grounded by package.json's `scripts` and README setup instructions, the same
way `platform` is grounded by file signals. This is recorded as
`setupSteps` in `.dvg/project-summary.json` and copied into `scenario.yaml`'s
`setup` field, so **the scenario file is a fully self-contained execution
plan**: not just what to click, but how to get there from nothing.

```yaml
setup:
  - name: "Install dependencies"
    command: "npm install"
    background: false
  - name: "Start dev server"
    command: "npm run dev"
    background: true
    readyUrl: "http://localhost:3000"
    readyTimeoutMs: 60000
scenes:
  - id: intro
    ...
```

`record`/`build` run this automatically whenever `target.url` isn't already
reachable: non-`background` steps run to completion in order (installs,
builds); the `background` step (there should be at most one, last in the
list) is started detached and, if it has `readyUrl`, polled until reachable
before recording starts. The `readyUrl` the LLM guesses is always
deterministically overwritten with the real `target.url` afterward, so it's
never actually relying on the LLM to have picked the right port.

This is edit-friendly like every other intermediate file — add/remove/reorder
steps, point `command` at a different script, add a `cwd` for a monorepo
subdirectory, etc. If `setup` is empty (nothing could be reliably
determined), `record`/`build` fall back to `dvg.config.yaml`'s
`source.startCommand` (see the `init --serve-command` flag) or a warning to
start the app manually — same as before this field existed.

Since this whole mechanism is just an ordered list of `{name, command,
background, readyUrl}`, it's already structured to extend beyond `npm`
projects — an Android setup plan might look like
`./gradlew installDebug` + `adb shell am start ...`, once a
platform-specific recorder exists to act on it.

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

# Run directly with tsx (builds automatically first — fast/incremental after the first run)
pnpm dev -- init --repo https://github.com/your-org/your-app.git --url http://localhost:3000
# or via task
task dev -- init --repo https://github.com/your-org/your-app.git --url http://localhost:3000
```

### Project Structure

```
packages/
├── cli/          Commands (Commander) + runners
├── core/         Shared types (Zod), schemas, utils (incl. bundled ffmpeg/ffprobe resolution)
├── source/       Deterministic project ingestion: git clone/local checkout,
│                 package.json/README reading, web route discovery
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
- **`demo-video-gen init` says it needs --repo or --source** — `analyze` reads
  real project source, so `init` needs to know where that project lives:
  `demo-video-gen init --repo <git-url> --url http://localhost:3000` or
  `--source <local-path>` for an existing checkout (must be a git repo).
- **`scenario.yaml`'s URLs don't match the real app** — route auto-discovery
  only supports Next.js (App/Pages Router) right now. Check
  `.dvg/source-context.json`'s `framework`/`routes` fields; if `routes` is
  empty, the AI was working from a file listing instead and accuracy will be
  lower — review and fix `goto` actions in `scenario.yaml` by hand before
  `record`.
- **`scenario generate` fails with "LLM failed to produce valid JSON after
  3 attempt(s)"** — the current model isn't a great fit for that task. It's
  a much harder structured-output task than `analyze` (multiple scenes,
  each with actions and a setup plan), so a model that handles `analyze`
  fine can still struggle here. See "Different models per task" — point
  `llm.tasks.scenario` at a stronger model (bigger local model, or Gemini)
  without changing what `analyze` uses. The warning output shows exactly
  which fields the model got wrong, which is useful context either way.
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
