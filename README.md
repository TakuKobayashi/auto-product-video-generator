# demo-video-gen

AI-powered promotional video generator for web apps. Point it at a real
git-managed project; it reads the actual source, plans a recording, drives
a real browser through it, and produces a narrated video.

日本語版: [README-ja.md](./README-ja.md) — より詳しいトラブルシューティング付き

---

## Requirements

Node.js ≥ 20, pnpm ≥ 9, git, Docker (for VOICEVOX). Everything else
(ffmpeg, Playwright, Task, and optionally Ollama) is installed by the setup
command below.

## Quick Start

```bash
git clone <this-repo> && cd demo-video-gen

task install          # one-time: installs everything (see task --list)
task serve            # starts local services (VOICEVOX, Ollama)
task doctor           # not sure something's set up right? check here

# Point it at the project you want a video for, and where it'll be running:
pnpm dev -- init --repo https://github.com/you/your-app.git --url http://localhost:3000
#   or: --source ../your-app   (for a project already checked out locally)

pnpm dev -- build       # go make the video
```

`init` generates `dvg.config.yaml`. Use `--repo` for a remote repository or
`--source` for a local checkout. The non-technical, product-usage editorial
direction is built in and does not need a config entry.

If VOICEVOX Engine and Ollama are already running through your own
`docker compose up -d`, skip `task serve`. Expose VOICEVOX on host port
`50021` and, when using Ollama, expose it on `11434`. Verify them with
`task doctor`, `curl http://localhost:50021/version`, and optionally
`curl http://localhost:11434/api/tags`.

No `task` binary? `pnpm install` alone still works for everything below —
see [Taskfile.yml](./Taskfile.yml) for what each `task` command actually
runs, or just use the plain `pnpm run <name>` equivalents in
[package.json](./package.json).

Output: `output/final.mp4`, with intermediate files under `output/artifacts/`
(scenario/script, subtitles, WAV narration, scene recordings, screenshots,
timeline, analysis results, logs, and the effective config). First run without
`GEMINI_API_KEY` set uses Ollama automatically — see `examples/dvg.config.yaml` for every config
option (each one is commented inline, not duplicated here).

---

## How it works

```mermaid
flowchart TD
    init(["<b>init</b><br/>--repo / --source"]) -->|writes| cfg[(dvg.config.yaml)]

    subgraph build["pnpm dev -- build  (one command runs all five ↓)"]
        direction TB
        analyze(["<b>analyze</b><br/>clone/read source,<br/>AI extracts features<br/>+ platform + setup plan"])
        scenario(["<b>scenario generate</b><br/>AI writes the recording<br/>plan (scenario.yaml)"])
        voice(["<b>voice</b><br/>VOICEVOX narration"])
        record(["<b>record</b><br/>Playwright records using<br/>actual narration durations"])
        render(["<b>render</b><br/>ffmpeg composite"])
        analyze -->|project-summary.json| scenario
        scenario -->|scenario.yaml, script.yaml| voice
        voice -->|script.yaml with actual timing| record
        record -->|recordings/*.mp4| render
    end

    cfg --> analyze
    render -->|output/final.mp4| done(["🎬 done"])
```

## Running all at once or step by step

Each box above is its own CLI command, reading/writing files under `.dvg/`
— so `build` isn't a black box, it's just those five in a row. Run them
`pnpm dev -- build` for the normal all-in-one path. To inspect or edit
intermediate results, run these commands in this exact order:

```bash
pnpm dev -- analyze
pnpm dev -- scenario generate
pnpm dev -- voice     # synthesizes WAVs and applies their actual timing
pnpm dev -- record    # requires the timed script and WAVs
pnpm dev -- render
```

Resume from the first unfinished or affected step:

| Last successful step / change | Resume with |
|---|---|
| analyze completed | `pnpm dev -- scenario generate` |
| scenario completed | `pnpm dev -- voice` |
| voice completed | `pnpm dev -- record` |
| recording completed | `pnpm dev -- render` |
| narration/subtitle text changed | start from `pnpm dev -- voice` |
| browser actions only changed | start from `pnpm dev -- record` |
| only render settings changed | run `pnpm dev -- render` |

| Command | Produces | Notes |
|---|---|---|
| `demo-video-gen init --repo <url>` | `dvg.config.yaml` | one-time; `--source <path>` for a local checkout instead |
| `demo-video-gen analyze` | `.dvg/source-context.json`, `.dvg/project-summary.json` | deterministic source scan + AI classification |
| `demo-video-gen scenario generate` | `.dvg/scenario.yaml`, `.dvg/script.yaml`, `.dvg/subtitles.srt` | scenario is AI; script/subtitles are derived deterministically from it |
| `demo-video-gen voice` | `.dvg/voice/*.wav` | also updates script/subtitle timing from actual audio |
| `demo-video-gen record` | `.dvg/recordings/*.mp4` | paces actions to audio timing; fails if the target is unreachable |
| `demo-video-gen render` | `output/final.mp4`, `output/artifacts/` | final video plus intermediate artifacts |

`demo-video-gen build [--skip-analyze] [--skip-scenario] [--skip-record] [--skip-voice]`
runs all five, skipping (reusing existing output for) whichever steps you
name. Every command's full option list is in `--help`
(e.g. `pnpm dev -- analyze --help`).

Recording cannot run before voice synthesis. When combining
`--skip-voice` with recording, existing `.dvg/voice/*.wav` files are still
required and are measured again before recording. After changing narration
or `video.sceneGapSeconds`, rerun `voice → record → render`.

---

## Configuration

`dvg.config.yaml` — see **[`examples/dvg.config.yaml`](./examples/dvg.config.yaml)**
for the full reference, every option commented inline (git source, target
URL, video type, LLM provider/fallback/per-task overrides, VOICEVOX). Not
duplicated here on purpose — that file *is* the documentation for it.

Three things worth knowing up front:

- **LLM provider**: `gemini` (needs `GEMINI_API_KEY`) or `ollama` (fully
  local, no key). `init` picks whichever you have available. A configured
  fallback is enabled only when its required API key is present, so an
  Ollama-only setup never fails on a missing cloud key. `analyze` and `scenario generate` can use
  *different* models via `llm.tasks` — useful since `scenario generate` is
  a harder task and sometimes needs a stronger model than `analyze` does.
- **Starting the app**: `analyze` tries to detect a start command
  (`npm run dev`, etc.) from `package.json` and bakes it into
  `scenario.yaml`'s `setup` plan; `record`/`build` run it automatically.
  Recording stops with an error instead of rendering blank/partial footage
  when the target is unreachable or a browser action fails.
- **Scene gaps**: `video.sceneGapSeconds` (default: `1`) controls the silent
  interval between narration clips/scenes. Voice synthesis applies it to
  script, subtitle, and recording timing.
- **Editorial direction**: the built-in default teaches non-technical viewers
  how to use the product and what they gain from it; no config entry is needed.
  Implementation terms such as frameworks, programming
  languages, hosting, and APIs are rejected from narration and regenerated.

---

## Troubleshooting

- **`scenario generate` fails schema validation repeatedly** — the model
  isn't a great fit for that task. Point `llm.tasks.scenario` at a
  different/stronger model (see `examples/dvg.config.yaml`) without
  changing what `analyze` uses.
- **`pnpm install` fails downloading ffmpeg/task binaries**, or
  **`ERR_PNPM_IGNORED_BUILDS`** — see the Japanese README's
  troubleshooting section (same content, more detail):
  [README-ja.md#トラブルシューティング](./README-ja.md).
- **Nothing works and you don't know why** — `task doctor`.
- **Recording stops on a URL or browser-action error** — first open
  `target.url` in a normal browser, then verify the `goto`, `click`, and
  `wait_visible` actions in `.dvg/scenario.yaml`. Rerun from `record` if
  narration is unchanged, or from `voice` if narration changed.

---

## Development

```
packages/
├── cli/          Commands (Commander) + runners
├── core/         Shared types (Zod schemas — read these for exact field definitions)
├── source/       git clone/local checkout, route + platform detection
├── ai/           LLM providers + analyze/scenario-generate pipelines
├── playwright/   Recording
├── voicevox/     Voice synthesis
└── renderer/     ffmpeg rendering

scripts/doctor.ts   environment diagnostics (task doctor)
Taskfile.yml        environment setup & service orchestration
```

```bash
task build          # or: pnpm run build
task dev -- <args>  # or: pnpm dev -- <args>  (builds first, then runs the CLI)
```

## License

MIT
