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
apvg project init --repo https://github.com/you/your-app.git
apvg video generate
```

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
