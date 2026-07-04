# demo-video-gen

AI-powered promotional video generator for web apps and CLI tools.

- **AI generates** the scenario, narration, subtitles, and timeline (YAML/JSON)
- **Deterministic tools** handle recording (Playwright), voice (VOICEVOX), and rendering (ffmpeg)
- Every intermediate file is human-editable before the next step

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |
| ffmpeg | any recent |
| VOICEVOX Engine | running on `localhost:50021` |
| Playwright (Chromium) | installed via `pnpm` |

## Quick Start

```bash
# 1. Install
npm install -g demo-video-gen

# 2. Install Playwright browser
npx playwright install chromium

# 3. Start VOICEVOX Engine
docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-latest

# 4. Set API key
export GEMINI_API_KEY=your_key_here

# 5. Initialize project
demo-video-gen init --url http://localhost:3000

# 6. Generate video (full pipeline)
demo-video-gen build
```

The final video will be at `./output/final.mp4`.

---

## Commands

### `init`
Initialize a project config (`dvg.config.yaml`).

```bash
demo-video-gen init [directory] [options]

Options:
  -u, --url <url>     Target application URL
  -t, --type <type>   Video type: teaser|shorts|demo|tutorial (default: demo)
  -n, --name <name>   Project name
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
  --ffmpeg <path>   Path to ffmpeg binary
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

voicevox:
  host: "http://localhost:50021"
  speakerId: 3

output:
  dir: "./output"
  workDir: "./.dvg"
```

### LLM Providers

| Provider | Env var |
|----------|---------|
| `gemini` | `GEMINI_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `claude` | `ANTHROPIC_API_KEY` |
| `groq`   | `GROQ_API_KEY` |
| `ollama` | `OLLAMA_HOST` (optional) |

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
pnpm install
pnpm build

# Run directly with tsx (no build required)
pnpm --filter demo-video-gen dev -- init --url http://localhost:3000
# or from repo root:
npx tsx packages/cli/src/index.ts init --url http://localhost:3000
```

### Project Structure

```
packages/
├── cli/          Commands (Commander) + runners
├── core/         Shared types (Zod), schemas, utils
├── ai/           LLM providers + AI pipelines
├── playwright/   Browser recording
├── voicevox/     Voice synthesis
└── renderer/     ffmpeg rendering
```

---

## License

MIT
