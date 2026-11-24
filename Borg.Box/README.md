# Borg.Box

The frontend for the **Borg.Box** Tauri desktop app (STFC mod manager), built on top of the **Borg Neural Tree Interface** demo. Served as-is by the Tauri shell in `../src-tauri` (`frontendDist` points here) - no bundler, no build step.

- Upstream SDK: https://github.com/JBlond/borg-html-sdk
- Live upstream demo: https://jblond.github.io/borg-html-sdk/
- Upstream license: MIT (see [`LICENSE.borg-html-sdk`](LICENSE.borg-html-sdk))

## What was added on top of the SDK

- [`js/native-io.js`](js/native-io.js) — routes file-system calls through Tauri's native fs/dialog plugins instead of the browser's File System Access API (which blocks writing `.dll`/`.exe`)
- [`icons/`](icons/) — generated app icons and `favicon.ico`
- Draggable nodes/hub and a live pulse-tracking engine were added on top of the original demo.
- Hub settings for compacting the version tree, preparing a client copy, and backing up / restoring that copy. The archive work itself runs in the Tauri/Rust shell (`../src-tauri`), not in this frontend.

## Running locally

For a quick preview without building the Tauri app, any static file server works, e.g.:

```bash
npx serve .
```

Real file-system access (installing mods, preparing/copying the client, backup and restore) only works inside the actual Tauri app (`npm run dev` / `npm run build` in the parent folder) - a plain browser tab has no `window.__TAURI__` and falls back to the browser's own (write-restricted) File System Access API. `npm run build` bumps the patch version first; `npm run dev` does not.

## Configuring the neural tree

Edit the `config` object in [`config.js`](config.js) — see the upstream README for the node schema (`id`, `x`, `y`, `r`, `title`, `text`, optional `parentId`, `closetext`, `shortcut`).

Keyboard shortcut: `f` fires a burst on every node.
