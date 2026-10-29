# LBQ App

Simple local electron app for personal use.

Command line version: [@hyrious/lbq](https://github.com/hyrious/lbq).

## Prerequisite

- Node.js 26+: `npm install -g typescript` (for typechecking)
- Windows: `winget install rcedit` and python (for .ico generation)
- macOS: `xcode-select --install` (installs `codesign`)

## Development

```sh
node --run install
node --run dev
node --run lint
```

## Build

```sh
node --run app # macOS: ~/Applications/LBQ.app
node --run exe # Windows: %LOCALAPPDATA%/Programs/LBQ/LBQ.exe
```

macOS builds are ad-hoc signed.

## License

MIT @ [hyrious](https://github.com/hyrious)
