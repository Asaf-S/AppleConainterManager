# Apple Container Desktop — TypeScript/Electron Port

TypeScript/Electron conversion of the original SwiftUI macOS app [AppleContainerDesktop](../AppleContainerDesktop-main).

## Architecture

| Layer | Swift Original | TypeScript Port |
|---|---|---|
| UI framework | SwiftUI | React 18 + Tailwind CSS |
| State management | `@Observable` / `@Environment` | React Context |
| Container SDK | ContainerClient Swift package | `container` CLI (shell-out) |
| Desktop shell | macOS native | Electron |
| Build | Xcode | electron-vite |

## Project Structure

```
src/
├── main/                     # Electron main process (Node.js)
│   ├── index.ts              # Window + tray setup
│   ├── services/             # CLI wrappers (mirror Swift services)
│   │   ├── cli.ts            # Base execFile wrapper
│   │   ├── ContainerService.ts
│   │   ├── ImageService.ts
│   │   ├── VolumeService.ts
│   │   └── SystemService.ts
│   └── ipc/                  # IPC handler registration
│       ├── containerHandlers.ts
│       ├── imageHandlers.ts
│       ├── volumeHandlers.ts
│       └── systemHandlers.ts
├── preload/
│   └── index.ts              # contextBridge API exposed to renderer
├── shared/
│   └── types/                # Shared TypeScript interfaces
│       ├── Container.ts      # ↔ ContainerDisplayModel.swift + ContainerManagement.swift
│       ├── Image.ts          # ↔ ImageDisplayModel.swift
│       ├── Volume.ts         # ↔ VolumeDisplayModel.swift
│       ├── KeyValue.ts       # ↔ KeyValueModel.swift
│       ├── common.ts         # Enums, Platform, PublishPort, UserSettings
│       └── ipc.ts            # IPC channel type definitions
└── renderer/                 # React UI
    ├── App.tsx
    ├── managers/
    │   ├── ApplicationManager.tsx  # ↔ ApplicationManager.swift (@Observable)
    │   └── UserSettingsManager.tsx # ↔ UserSettingsManager.swift (@Observable)
    └── components/
        ├── ContentView.tsx          # ↔ ContentView.swift + AppleContainerDesktopApp.swift
        ├── SettingsView.tsx         # ↔ SettingsView.swift
        ├── common/                  # ↔ Views/Components/
        ├── Container/               # ↔ Views/Container/
        ├── Image/                   # ↔ Views/Image/
        └── Volume/                  # ↔ Views/Volume/
```

## Prerequisites

- macOS with Apple Container installed (`/usr/local/bin/container`)
- Node.js 20+

## Getting Started

```bash
npm install
npm run dev        # Start in development mode (hot reload)
npm run build      # Build for production
```

## Key Differences from Swift Original

1. **CLI instead of SDK** — The Swift app uses Apple's `ContainerClient` Swift package (internal gRPC/XPC). The TypeScript version calls the `container` CLI binary and parses JSON output via `--format json`.

2. **Cross-process IPC** — SwiftUI views call Swift services directly. Here the renderer (React) calls the main process (Node.js) via Electron IPC (`window.electron.*`).

3. **No launchd integration** — System start/stop uses `launchctl bootstrap`/`bootout` directly. The original Swift app uses `ServiceManager` from `ContainerPlugin`.

4. **Settings persistence** — Swift uses `UserDefaults`. TypeScript uses `electron-store` (JSON file in app data directory).
