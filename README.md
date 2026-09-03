# Greeneek

English | [中文](README.zh.md)

Greeneek is an open-source agent harness based on the MIT-licensed [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) codebase.

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: see the in-repository [user guide](docs/user/guide/index.md) and [development guide](docs/development.md).

## Branding and models

- App branding stays **Greeneek**.
- The logo stays **Greeneek**.
- The theme stays **Greeneek green**.
- Model provider and model names stay **DeepSeek**, because Greeneek does not have separate model names:
  - `DeepSeek`
  - `DeepSeek-V4-Flash`
  - `DeepSeek-V4-Pro`
  - `DeepSeek-V4-Flash-Vision-Exp`

## Developer preview

Greeneek is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/Moon-Mummy/Greeneek.git
cd Greeneek
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Issues](https://github.com/Moon-Mummy/Greeneek/issues).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
