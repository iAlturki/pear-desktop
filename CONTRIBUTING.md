# Contributing

A map of how this codebase is put together, aimed at getting you from "cloned the repo" to
"confidently editing plugin code" without having to reverse-engineer the plugin loader first.
For install/build/download instructions for *users*, see [README.md](README.md).

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm dev          # electron-vite dev server + hot reload
pnpm dev:debug    # same, with ELECTRON_ENABLE_LOGGING=1 (useful if the window never appears)
```

Before opening a PR:

```bash
pnpm check        # lint (oxlint) + format check (oxfmt) + typecheck (tsc)
pnpm format       # auto-fix formatting
pnpm test         # Playwright
```

Requires Node >=22 and pnpm >=11 (see `engines` in `package.json`).

## The shape of the app

This is a single package built three times by `electron-vite` (config in `electron.vite.config.mts`)
into three separate bundles that run in three separate JS contexts:

| Entry point    | Runs in                       | Has access to           |
| -------------- | ------------------------------ | ------------------------ |
| `src/index.ts`    | Electron **main** process   | Node, Electron APIs, no DOM |
| `src/preload.ts`  | **Preload** (isolated world) | Node + a bridged subset of Electron, no page DOM |
| `src/renderer.ts` | **Renderer** (the actual YouTube Music page) | DOM, `window`, no direct Node/Electron |

Everything under `src/plugins/*` gets compiled into *all three* bundles (see below), which is the
source of the single most common plugin bug - more on that shortly.

Other top-level pieces:

- `src/menu.ts` - builds the native `Electron.Menu` (File-menu-bar style). Every plugin gets an
  auto-generated enable/disable checkbox here for free; a plugin's own `menu()` adds items under it.
- `src/config/` - persisted settings (`electron-store`-backed). `config/plugins.ts` is the
  enable/disable/get/set API for per-plugin config, exposed to the renderer as `window.mainConfig`
  via `contextBridge` in `preload.ts`.
- `src/loader/` - one file per context (`main.ts`, `preload.ts`, `renderer.ts`, `menu.ts`) that
  discovers plugins, merges their config with stored overrides, and calls their lifecycle hooks.
- `src/providers/` - glue to the actual YouTube Music page/player (song info, song controls,
  window controls, DOM element selectors) that plugins build on instead of poking the page directly.
- `src/i18n/resources/en.json` - all user-facing strings. Other locales are community-translated
  (see README's Translation section) and fall back to English for missing keys, so you only need
  to add the English entry when adding a plugin.
- `src/types/` - shared type defs, notably `music-player.ts` (the `#movie_player` element's API
  surface) and `plugins.ts` (the plugin lifecycle types described below).

## The plugin system

Plugins are auto-discovered by glob - `src/plugins/*/index.{js,ts,jsx,tsx}` (excluding
`src/plugins/utils/**`, which is a shared-code folder, not a plugin) - via
`vite-plugins/plugin-importer.mjs`. There's no manual registration step; drop a folder in and it's
a plugin.

A minimal plugin:

```typescript
// src/plugins/my-plugin/index.ts
import { t } from '@/i18n';
import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => t('plugins.my-plugin.name'),
  description: () => t('plugins.my-plugin.description'),
  restartNeeded: false,
  config: { enabled: false },
  renderer: {
    onPlayerApiReady(api) {
      // `api` is the #movie_player element - see src/types/music-player.ts
    },
  },
});
```

`createPlugin` takes up to five sections, each optional except `config`:

- `menu(context)` - returns extra `Electron.MenuItemConstructorOptions[]` under this plugin's
  entry in the Plugins menu.
- `backend` - runs in the **main** process (has `window: BrowserWindow`, full Node/Electron).
- `preload` - runs in the **preload** context.
- `renderer` - runs in the **renderer**, i.e. the actual page. This is the only context with the
  `onPlayerApiReady(api, context)` hook.

`backend`/`preload`/`renderer` can each be either a plain function (called once, no separate
stop/config-change hooks - fine for something that just injects a stylesheet) or an object with:

- `start(context)` - called once when the plugin is enabled and loaded.
- `stop(context)` - called once when the plugin is disabled/unloaded. Clean up every listener,
  observer, and interval you registered in `start`/`onPlayerApiReady` here - plugins can be
  toggled on and off live, without a restart, and a leaked listener from three enable/disable
  cycles ago is a very confusing thing to debug later.
- `onConfigChange(newConfig)` - called when an **already-enabled** plugin's config changes for a
  reason other than the enable flag itself (see the gotcha below - this one has bitten real code
  in this repo).

`restartNeeded: true` shows a "restart to apply" dialog after a config change, but does **not**
gate whether the plugin actually gets live-loaded/unloaded - the loader always tries to run
`start`/`stop` immediately regardless of this flag. Treat it as a UI hint for changes that are
awkward to apply mid-session (e.g. window frame changes), not a mechanism you can rely on to defer
work until an actual restart.

## Gotchas that cost real debugging time in this repo

These aren't hypothetical - each one caused a shipped bug at some point. Save yourself the loop.

**Plugin files are imported in the main process too, just to check if they export `.backend`.**
Any module-top-level code that touches a browser-only global (`document`, `HTMLMediaElement`,
`window`, ...) crashes the *entire app* on startup with something like
`ReferenceError: HTMLMediaElement is not defined`, because Node has none of those. Fix: defer that
access into a function that's only ever called from a renderer-only lifecycle hook
(`onPlayerApiReady`, `renderer.start`), never at module scope.

**Enabling/disabling a plugin runs `start()`/`stop()`, not `onConfigChange`.** `onConfigChange`
only fires for an *already-loaded* plugin's other settings changing - the loader adds a plugin to
its "loaded" map only after `start()` resolves, so a config-change event that arrives around the
same time as the enable transition can be silently dropped as a race, on top of the hook simply
being the wrong one conceptually. If you need something to happen when a plugin gets turned on
(not just when it changes `enabled: true`'s *neighboring* settings), put it in `start()`, and put
its inverse in `stop()`. (`src/plugins/performance-mode/index.ts` learned this one in production.)

**Don't override `HTMLVideoElement.prototype.pause` / the `<video>` element's own `.pause()`.**
The player calls it internally for reasons that have nothing to do with the user pausing -
seeking, buffering, track transitions - so intercepting it breaks playback in ways that look like
random audio glitches. If you need to react to or gate a *user* pause, intercept the higher-level
`api.pauseVideo()` on the `#movie_player` element instead; that's the same entry point this app's
own IPC/media-key/shortcut paths already use (see `renderer.ts`).

**Shadow DOM retargets `event.target` on document-level capturing listeners.** If you're
listening for clicks on a specific button (e.g. the player bar's next/previous buttons) via a
`document.addEventListener(..., true)`, `event.target` will be the shadow host, not the button you
actually clicked, whenever the button lives inside a web component's shadow tree. Use
`event.composedPath()` and search that instead.

**`oxfmt --write` strips "redundant" parentheses that `oxlint`'s `no-mixed-operators` rule then
flags.** Parens alone don't survive a reformat pass. If you have an expression mixing operators
(e.g. `&&`/`||`, or arithmetic with different precedence), extract the ambiguous sub-expression to
a named intermediate variable instead of relying on parens to disambiguate.

**A CSS custom property meant to be overridden per-instance needs `@property { inherits: true }`.**
Without it, setting the variable inline on one element (e.g. via `element.style.setProperty`) won't
reach descendants that reference it through `var()` in a rule defined elsewhere (like `:root`) -
they'll silently keep using the fallback/root value instead of the per-instance one.

**`requestAnimationFrame` does not fire while the window is minimized or occluded**, even with
Electron's `backgroundThrottling` disabled in some configurations - and by default Electron
throttles background windows quite aggressively regardless. Anything correctness-critical that's
driven by rAF (a volume fade, a UI animation with a callback the rest of your logic depends on)
needs a fallback that isn't rAF-based - a `setTimeout` watchdog and/or a `document.hidden` check
that completes immediately - or it can get permanently stuck the moment the user minimizes the
window mid-animation. See `src/plugins/utils/renderer/volume-fader.ts` for the pattern.

**The `in-app-menu` plugin (default-on for Windows) renders its own custom title bar from the
native `Electron.Menu` template, not the OS's native menu chrome.** It handles `submenu`,
`checkbox`, `radio`, and `normal` item types *inside* a dropdown panel correctly, but its
top-level menu-bar row (`TitleBar.tsx`) historically only knew how to open a submenu - a top-level
item with no submenu (e.g. a standalone one-click toggle) would render with no check icon and do
nothing on click, silently. If you add a top-level menu entry that isn't submenu-based, make sure
`TitleBar.tsx`'s top-level render branch actually handles its `type`.

**Asynchronous DOM events can fire after synchronous state flags have already reset.**
When an automated fade-out ends, assigning `video.volume = 0` queues an asynchronous `volumechange`
event in the browser. If your code resets `isFading = false` synchronously right when the fade
calculation finishes, that queued event arrives *after* `isFading` is already false—causing an
"ignore changes while fading" guard to fail and overwrite the remembered user volume with `0`. Every
subsequent fade-in then fades from 0 to 0 (silence) permanently. Fix: capture initial state
synchronously the instant the operation begins rather than relying on an asynchronous event listener
with a boolean guard (see `src/plugins/fade-playback/index.ts`).

**MediaSource Extensions (MSE) continuous playback does not fire `<video>`'s `'play'` event across automatic track transitions.**
In YouTube Music's queue playback, continuous streaming appends new audio chunks to the existing MSE SourceBuffer without pausing the `<video>` element (`video.paused` stays `false`). Relying solely on `video.addEventListener('play', ...)` to trigger fade-in or state resets on autoskip will fail because `'play'` never fires. Listen to the `videodatachange` event (`detail.name === 'dataloaded'`) or `peard:src-changed` instead to reliably detect track transitions (see `src/plugins/fade-playback/index.ts`).


## Code style

- Lint: `pnpm lint` (`oxlint --type-aware`)
- Format: `pnpm format` / `pnpm format:check` (`oxfmt`)
- Types: `pnpm typecheck` (`tsc --noEmit`)
- `pnpm check` runs all three - this is what CI runs, so it's the fastest way to know if a PR will
  pass before pushing.

No enforced comment style beyond "explain *why*, not *what*" - a well-named function already says
what it does; a comment earns its place by capturing a constraint, workaround, or non-obvious
reason that isn't visible from the code alone (most of the gotchas above exist as comments at
their actual call sites too, not just here).

## Finding a worked example

Rather than starting from the minimal template above, it's often faster to copy the shape of a
plugin that already does something similar:

- **Fading audio / anything driven by a timer that must survive the window being minimized** -
  `src/plugins/fade-playback` + `src/plugins/utils/renderer/volume-fader.ts`.
- **A plugin that needs to enable/disable *other* plugins programmatically, and restore their
  prior state later** - `src/plugins/performance-mode`.
- **Injecting a button/UI element into the actual YouTube Music page** - `src/plugins/video-toggle`
  or `src/plugins/ad-skip`.
- **Custom in-app UI (Solid.js components rendered into the page, not just CSS)** -
  `src/plugins/synced-lyrics/renderer` or `src/plugins/in-app-menu/renderer`.
- **Main-process-only work (window control, native menus, IPC)** -
  `src/plugins/taskbar-mediacontrol` or `src/plugins/discord`.
