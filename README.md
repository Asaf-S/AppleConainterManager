# Apple Container Desktop

A TypeScript/Electron GUI for [Apple Container](https://github.com/apple/container) — a tool to create and run Linux containers as lightweight virtual machines on macOS.

This is a TypeScript rewrite of [AppleContainerDesktop](https://github.com/0Itsuki0/AppleContainerDesktop) by [0Itsuki0](https://github.com/0Itsuki0), originally written in Swift/SwiftUI. This version replaces the native macOS app with an Electron-based desktop app using TypeScript.

> [!IMPORTANT]
> Requires Apple Container [0.6.0](https://github.com/apple/container/releases/tag/0.6.0) or later.

## Prerequisites

- macOS (Apple Silicon or Intel)
- [Apple Container](https://github.com/apple/container) installed at `/usr/local/bin/container`, or via `brew install --cask container`
- [Node.js](https://nodejs.org/) (for running from source)

## Running from Source

```bash
git clone https://github.com/Asaf-S/AppleConainterManager.git
cd AppleConainterManager
npm install
npm start
```

For development mode:

```bash
npm run dev
```

## Build

```bash
npm run build
```

Compiles TypeScript to `dist/`.

## Features

### Images
- Pull images from remote registries
- Build images from a Dockerfile
- Save images as OCI-compatible tar archives
- Load images from OCI-compatible tar archives
- Delete images
- Inspect image metadata (OS, architecture, associated containers, etc.)

### Containers
- Create containers from local images or remote references
- Set custom names, published ports, and environment variables
- Start, stop, and delete containers
- Inspect container status, ports, environment variables, and logs

### Volumes
- List volumes with metadata (size, source, associated containers)
- Create and delete volumes
- Mount volumes when creating containers

### Settings
- Configure path to the `container` executable
- Set application data directory
- Adjust timeouts for system start/stop and container stop

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron |
| Language | TypeScript |
| Renderer | Vanilla JS + CSS |
| Container backend | Apple Container CLI |

## Project Structure

```
src/
  main.ts          # Electron main process
  preload.ts       # Preload script (IPC bridge)
  container-cli.ts # Apple Container CLI wrapper
  types.ts         # Shared TypeScript types
renderer/
  app.js           # Renderer process UI logic
  styles.css       # Styles
```

## Differences from the Swift Original

1. **CLI instead of SDK** — The Swift app uses Apple's `ContainerClient` Swift package (internal gRPC/XPC). This version shells out to the `container` CLI binary and parses JSON output via `--format json`.

2. **Cross-process IPC** — SwiftUI views call Swift services directly. Here the renderer calls the main process via Electron IPC.

3. **No launchd integration** — System start/stop calls `launchctl bootstrap`/`bootout` directly, rather than using `ServiceManager` from `ContainerPlugin`.

4. **Settings persistence** — Swift uses `UserDefaults`. This version stores settings as a JSON file in the app data directory.

## License

MIT

## Credits

Original app by [0Itsuki0](https://github.com/0Itsuki0) — [AppleContainerDesktop](https://github.com/0Itsuki0/AppleContainerDesktop)
