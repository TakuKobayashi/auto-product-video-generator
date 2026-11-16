# auto-product-video-generator

AI-powered promotional video generator for web and Android apps.

## Install

```bash
npm install --global auto-product-video-generator
apvg setup
apvg doctor
apvg --help
```

## Quick Start

Run APVG in a directory where it can create `apvg.config.yml`, `.apvg/`, and
`output/`:

```bash
mkdir my-product-video
cd my-product-video
apvg serve
apvg project init --repo https://github.com/you/your-app
apvg video generate
```

The `.git` suffix is optional for HTTPS and SSH repository URLs, including
GitHub, GitLab (also self-hosted), and other Git servers using this convention.
APVG adds `.git` before cloning and retries the original URL if that fails,
so servers with other URL conventions remain supported. Use the repository
root URL, rather than a file, branch, or issue page.

For an existing local git checkout, initialize with
`apvg project init --source ../your-app` instead. Run `apvg --help` or
`apvg <command> --help` to see all commands and options.

`apvg setup` installs Chromium, while `apvg doctor` only checks system
dependencies and prints setup hints. Docker, Ollama, git, and Android SDK tools
are not installed automatically. Use `apvg services status` to inspect local
services and `apvg services stop` to stop the APVG-managed VOICEVOX container.

The CLI also requires git and a running VOICEVOX Engine. Video rendering and
Android recording require the corresponding external platform tools. See the
project documentation for the complete setup and configuration guide.

For requirements, setup, configuration, and examples, see the
[project documentation](https://github.com/TakuKobayashi/auto-product-video-generator#readme).

## License

MIT
