# Borg.Box

A PWA (installable, offline-capable) wrapper around the **Borg Neural Tree Interface** demo.

- Upstream SDK: https://github.com/JBlond/borg-html-sdk
- Live upstream demo: https://jblond.github.io/borg-html-sdk/
- Upstream license: MIT (see [`LICENSE.borg-html-sdk`](LICENSE.borg-html-sdk))

## What was added on top of the SDK

- [`manifest.webmanifest`](manifest.webmanifest) — PWA manifest (name, icons, standalone display, theme colors)
- [`service-worker.js`](service-worker.js) — cache-first offline support for the app shell
- [`icons/`](icons/) — generated app icons (regular + maskable, 16–512px) and `favicon.ico`
- `index.html` — manifest link, theme-color, apple-touch-icon meta tags, and service worker registration
- Draggable nodes/hub and a live pulse-tracking engine were added on top of the original demo.

## Running locally

Any static file server works, e.g.:

```bash
npx serve .
```

Then open the printed `http://localhost` URL in a browser. Service workers require `http://localhost` or `https://` (not `file://`).

## Installing as an app

Once served over `http(s)`, use the browser's "Install app" / "Add to Home Screen" option to install Borg.Box as a standalone PWA.

## Configuring the neural tree

Edit the `config` object in [`config.js`](config.js) — see the upstream README for the node schema (`id`, `x`, `y`, `r`, `title`, `text`, optional `parentId`, `closetext`, `shortcut`).

Keyboard shortcut: `f` fires a burst on every node.
