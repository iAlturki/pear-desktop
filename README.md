# ytr-music (iALTURKi Edition)

**Reconstructed, ultra-reliable, 100% ad-free YouTube Music desktop player with hardware-throttled Super Performance Mode and sample-accurate butter-smooth audio transitions.**

---

## What Makes This Edition Different

| Pillar | Default YouTube Music Desktop | **ytr-music (iALTURKi Edition)** |
| :--- | :--- | :--- |
| **Ads & Tracking** | Unskippable video ads, promotional banners, telemetry | **100% Ad-Free**: In-player JSON payload pruner + multi-list declarative network blocker + instant auto-skip fallback. |
| **Performance** | Constant GPU video decoding (even when video is hidden), heavy blur filters | **Super Performance Mode**: Automatically caps hidden video streams to 144p `tiny` quality, disables GPU video decode pipes, strips backdrop-filter / canvas overhead. |
| **Audio Transitions** | Abrupt cuts on pause, clicks on resume, broken autoskip fades | **Silky Smooth Audio**: Continuous logarithmic volume curves with high-resolution end-of-track polling, pre-play zeroing (no pops), and MediaSource transition integration. |
| **Volume Reliability** | Desync on startup (slider at 15%, sound at 100%) | **Strict Synchronization**: Pre-seeded localStorage + component-level playbar hook + race-condition-free volume persistence. |
| **Stability** | Fragmented background throttling crashes | **Self-Healing Architecture**: Zero-discontinuity scalers, rAF starvation watchdogs, isolated plugin boundaries. |

---

## Quick Start

### Option 1: One-Click Run (Windows)
Double-click **`Run.bat`** in the repository root. It terminates any stale background instances, builds updated bundles, and launches the app immediately.

### Option 2: Command Line
```powershell
# Install dependencies
pnpm.cmd install

# Build production bundles
pnpm.cmd build

# Start the application
pnpm.cmd start
```

---

## Core Innovations

### 1. 100% Ad-Free Playback Engine
- **In-Player Payload Pruner (`src/plugins/do-not-track/injectors/inject.ts`)**: Injected into the preload pipeline to scrub ad breaks, tracking parameters, and ad slots directly from YouTube's `ytInitialPlayerResponse` and runtime `playerResponse` objects before the media player ever receives them.
- **Network Engine Blocker (`src/plugins/do-not-track/blocker.ts`)**: Built-in fallback rule sets from EasyList, EasyPrivacy, and uBlock Origin to intercept telemetry and ad domains at the Electron session level.
- **Microsecond Ad Skip (`src/plugins/ad-skip/index.ts`)**: If an edge-case ad manages to load, it is instantly muted and fast-forwarded at `playbackRate = 16` to `currentTime = duration`.

### 2. Hardware-Throttled Super Performance Mode
- **Zero Background Video Decode**: When in song/audio-only mode or when video is suppressed, YouTube's DASH player is locked to `playback-mode="ATV_PREFERRED"` and stream quality is throttled to `'tiny'` (144p). This slashes GPU 3D and Video Decode overhead from hundreds of MBs down to near zero.
- **Compositing Cleanup**: Backdrops, heavy blur filters, and canvas drawing contexts are suspended to preserve CPU and battery life.

### 3. Butter-Smooth Audio Engine
- **Logarithmic Perceptual Curve**: Replaces linear volume scaling with continuous psychoacoustic decibel curves, eliminating the harsh volume "cliff" on pause.
- **Pre-Play Zeroing**: Guarantees `video.volume = 0` *before* the media element unpauses, preventing loud onset pops on resume.
- **High-Resolution End-of-Track Polling**: 25ms precision monitor during the final seconds of a song so that short fade-outs (e.g. 200ms) are never skipped due to coarse 250ms `timeupdate` intervals.
- **MediaSource (MSE) Auto-Advance Sync**: Listens to YouTube's internal `videodatachange` events so seamless playlist advances fade smoothly from track to track without needing a video pause/play cycle.

---

## Project Structure & Contribution

For architectural guidelines, plugin development, and hard-won gotchas, consult [`CONTRIBUTING.md`](./CONTRIBUTING.md).

```
src/
├── plugins/
│   ├── ad-skip/             # Instant ad fast-forward & skip fallback
│   ├── do-not-track/        # In-player JSON payload pruner & network blocker
│   ├── fade-playback/       # Smooth pause, skip, resume & autoskip engine
│   ├── performance-mode/    # Extreme low-overhead mode with GPU decode suppression
│   ├── precise-volume/      # Granular volume control with startup desync fix
│   └── video-toggle/        # Seamless audio-only / video switcher with quality throttling
├── providers/               # Song info, IPC bridges, and extracted player data
└── renderer.ts              # Renderer process bootstrap & Web Audio plumbing
```

---

## Authors & Legal

- **Creator & Reconstruction Maintainer**: **[iALTURKi](https://github.com/iALTURKi)**
- **Original Base**: [th-ch / pear-devs](https://github.com/pear-devs/pear-desktop)
- **License**: MIT License (see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE)).
