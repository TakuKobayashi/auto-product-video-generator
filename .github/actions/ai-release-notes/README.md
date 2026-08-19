# AI release notes composite action

Creates or updates a GitHub Release by summarizing the Git history and file diff
between the current semantic-version tag and its previous reachable release tag.
Inference runs locally with Ollama, so source diffs are not sent to a hosted LLM
and no model API key is required. On a GitHub-hosted Linux runner, the action
installs and starts Ollama when it is not already available.

```yaml
permissions:
  contents: write

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
  - uses: ./.github/actions/ai-release-notes
    with:
      github-token: ${{ github.token }}
      tag: ${{ github.ref_name }}
      model: qwen2.5-coder:7b-instruct
      language: jp
      bilingual: 'true'
```

The action gives commit subjects, authors, a diff summary, and at most 60,000
characters of the patch to Ollama. The default `qwen2.5-coder:7b-instruct`
model is code-focused, fits comfortably on a standard GitHub-hosted runner,
and has a 32K context window. If inference is unavailable, the action publishes
deterministic notes containing the commit list and diff summary. Set
`fail-on-llm-error: "true"` to disable that fallback. Use `ollama-host` to point
at an existing Ollama server.

Non-source and binary contents are excluded from the patch sent to Ollama. This
includes image, video, audio and 3D files; archives and packages such as
`unitypackage`; executables and libraries; fonts and binary office documents;
databases and datasets; ML weights; game-engine bundles; source maps; and
credential containers. Their paths, change statuses, and diff statistics remain
available as supporting context. When a release changes only excluded files,
the action tells the model to derive the summary primarily from commit messages
rather than pretending to inspect their contents. Lockfiles and ordinary text
configuration such as JSON and YAML remain part of the analyzed diff.

`language` defaults to `en` and produces notes only in the selected language.
Set `bilingual: "true"` to include English first and the selected language
second. Both `ja` (the standard language code) and `jp` are accepted for
Japanese; this repository passes `jp` with bilingual mode enabled.

Outputs are `release-url`, `previous-tag`, and `used-llm`.

## Local preview

Start Ollama and pull the configured model, then run the script from the
repository root. In dry-run mode, `tag` defaults to the current `HEAD`, no
`GITHUB_TOKEN` is needed, and no GitHub Release is changed.

The local preview assumes that Ollama is already installed and its server is
running. Before reading Git history, the script checks the server and configured
model. If either is unavailable, it exits with a concrete `ollama serve` or
`ollama pull <model>` command instead of a generic inference error.

```powershell
# Run `ollama serve` in another terminal first if Ollama is not already running.
ollama pull qwen2.5-coder:7b-instruct
node .github/actions/ai-release-notes/generate-release-notes.mjs `
  --dry-run `
  --language jp `
  --bilingual `
  --model qwen2.5-coder:7b-instruct `
  --output-file release-notes-preview.md
```

Pass `--tag v1.2.3` to preview an existing tag instead of `HEAD`. Run the script
with `--help` for all options. The `INPUT_*` environment variables remain
supported because the composite action uses them internally.

To publish this in GitHub Marketplace later, move this directory into a public,
dedicated repository so that `action.yml` is at its root, then replace the local
`uses` path with `OWNER/ACTION@v1` (or preferably a full commit SHA).
