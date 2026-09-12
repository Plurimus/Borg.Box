# Borg.Box

[English](#english) | [Русский](#русский)

---

## English

**Borg.Box** is a mod manager for *Star Trek Fleet Command™*'s [BepInEx](https://github.com/BepInEx/BepInEx) modding ecosystem, presented as a Borg-themed neural tree interface. It runs either as an installable PWA or as a native Windows desktop app (this repository — a [Tauri](https://tauri.app/) wrapper around the same frontend).

### What it does

- Visualizes the mod catalog as a branching neural tree around a central hub: each branch is a mod, each node on the branch is a version, the outermost (largest) node is the current/latest version.
- Installs, updates, and removes signed `.mod` packages directly into a copy of your game client folder — no manual file copying.
- Verifies package signatures and file hashes before installing anything.
- Lets you add extra mod sources (a `catalog.json` URL or a local folder) alongside the default one.
- Includes an in-app **assembly module** to build and sign your own `.mod` packages (manifest editor, DLL metadata reading, changelog/screenshots, key generation).
- Full UI in 10 languages: English, Russian, German, Italian, French, Spanish, Portuguese, Korean, Chinese, Japanese.
- The desktop build (this repo) writes files with native Rust I/O, so it isn't limited by the browser's File System Access API restrictions on installing `.dll`/`.exe` files that the PWA version runs into.

### Download

Grab the latest release from the [Releases](../../releases) page:

- **Installer** (`Borg.Box_*_x64-setup.exe` or `.msi`) — installs Borg.Box like a normal Windows app, with a Start Menu shortcut and uninstaller.
- **Portable** (`Borg.Box-portable-*.zip`) — unzip and run `Borg.Box.exe`, no installation needed.

### Building from source

Requires [Node.js](https://nodejs.org/) and [Rust](https://www.rust-lang.org/tools/install) (`rustup`).

```bash
npm install
npm run dev     # run in development mode
npm run build   # produce release installers + portable exe
```

The actual frontend (plain JS/SVG, no framework) lives in [`Borg.Box/`](Borg.Box/) — see [`Borg.Box/README.md`](Borg.Box/README.md) for how it's built on top of the [borg-html-sdk](https://github.com/JBlond/borg-html-sdk) (MIT-licensed) neural tree demo, and how to run it as a plain browser PWA instead of the desktop build. [`src-tauri/`](src-tauri/) is the native wrapper that gives the same frontend real filesystem access.

### Support

For STFC BepInEx items and Borg.Box support, please visit the [BORG Box](https://discord.gg/8MRcfserGH) Discord server.

---

## Русский

**Borg.Box** — менеджер модов для экосистемы [BepInEx](https://github.com/BepInEx/BepInEx) в *Star Trek Fleet Command™*, оформленный в виде борговского нейронного дерева. Работает как устанавливаемое PWA-приложение в браузере, так и как нативное десктопное приложение под Windows (этот репозиторий — обёртка на [Tauri](https://tauri.app/) поверх того же фронтенда).

### Что умеет

- Показывает каталог модов в виде дерева ветвей вокруг центрального хаба: каждая ветка — мод, каждый узел на ветке — версия, самый крайний (большой) узел — текущая/последняя версия.
- Устанавливает, обновляет и удаляет подписанные `.mod`-пакеты прямо в копию папки клиента игры — без ручного копирования файлов.
- Проверяет подписи пакетов и хэши файлов перед установкой.
- Позволяет добавлять дополнительные источники модов (ссылку на `catalog.json` или локальную папку) в дополнение к основному.
- Включает встроенный **модуль сборки** для создания и подписи собственных `.mod`-пакетов (редактор манифеста, чтение метаданных из DLL, changelog/скриншоты, генерация ключей).
- Полный интерфейс на 10 языках: русский, английский, немецкий, итальянский, французский, испанский, португальский, корейский, китайский, японский.
- Десктопная сборка (этот репозиторий) записывает файлы через нативный Rust-код, поэтому не упирается в ограничение File System Access API браузера на установку `.dll`/`.exe` файлов, с которым сталкивается PWA-версия.

### Скачать

Последний релиз — на странице [Releases](../../releases):

- **Установщик** (`Borg.Box_*_x64-setup.exe` или `.msi`) — ставит Borg.Box как обычное Windows-приложение, с ярлыком в меню Пуск и деинсталлятором.
- **Портативная версия** (`Borg.Box-portable-*.zip`) — распакуйте и запустите `Borg.Box.exe`, установка не нужна.

### Сборка из исходников

Нужны [Node.js](https://nodejs.org/) и [Rust](https://www.rust-lang.org/tools/install) (`rustup`).

```bash
npm install
npm run dev     # режим разработки
npm run build   # сборка релизных установщиков + портативного exe
```

Сам фронтенд (чистый JS/SVG, без фреймворков) лежит в [`Borg.Box/`](Borg.Box/) — см. [`Borg.Box/README.md`](Borg.Box/README.md) о том, как он построен поверх демо [borg-html-sdk](https://github.com/JBlond/borg-html-sdk) (лицензия MIT) и как запустить его как обычное PWA в браузере вместо десктопной сборки. [`src-tauri/`](src-tauri/) — нативная обёртка, дающая тому же фронтенду настоящий доступ к файловой системе.

### Поддержка

По вопросам модов STFC BepInEx и Borg.Box — сервер Discord [BORG Box](https://discord.gg/8MRcfserGH).
