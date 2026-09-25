# LBQ App

Simple local electron app for personal use. Register tools in `tools/*/plugin.ts`.

Command line version: [@hyrious/lbq](https://github.com/hyrious/lbq).

## Prerequisite

- Windows: `winget install rcedit`
- macOS: `xcode-select --install` (installs `codesign`)

## Usage

```sh
node --run install
node --run app
```

It will write an `~/Applications/LBQ.app` on macOS.

## Development

```sh
node --run typecheck
node --run dev
```

See [docs/DESIGN.md](docs/DESIGN.md) for the runtime contracts and lifecycle.

## License

MIT @ [hyrious](https://github.com/hyrious)
