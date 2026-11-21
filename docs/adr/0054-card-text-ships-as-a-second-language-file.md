# 54. Card text ships as a second file per language

- Status: Accepted
- Date: 2026-11-21

## Context

Startup waited for one complete runtime file per language before the first render. On 2026-11-21 the Chinese file was 1.6 MB (388 KB gzip). About 1 MB of it was card text: `cardFaces`, plus the same long text repeated under `occupations`, `minorImprovements` and `improvements`. The lobby, login and settings show no card text. A player on a slow mobile link to GitHub Pages waited about 8 seconds on the static loading screen.

## Decision

- Each language ships two content-addressed files from `open-agricola-i18n`:
  - the **Core Language Pack** `<id>.<hash16>.json`, which holds every group except card text;
  - the **Card Text Pack** `<id>-cards.<hash16>.json`, which holds `cardFaces`, `occupations`, `minorImprovements`, `improvements`, `cards` and `parentFaces`.
- The language manifest moves to `version: 2`. Each language lists `core` and `cards` as `{ file, sha256 }`, plus `sourceSha256`. The app reads only version 2. The pinned `i18n.ref` decides which version a build uses.
- The published typed groups keep their names and other runtime keys. Their `description`, `rules` and `prerequisite` are dropped, because the client reads that text from `cardFaces`. The `locales/*.json` sources are unchanged.
- The client registers both parts under one locale, and translations read their union. Startup waits for the Core Language Pack and starts the Card Text Pack download without waiting. The game, Workshop and encyclopedia routes render behind a Card Text boundary. Workshop game and Replay entries, and switching languages, load both parts first. The server, tests and build tools combine both files.

## Consequences

- The Chinese startup download drops from 388 KB to 53 KB gzip. Card text (205 KB gzip) arrives in parallel, and the total is smaller.
- Card-free screens can render `{card:…}` placeholders before card text arrives. Until then they show the English metadata name.
- A pack consumer that needs card text must read both files. Code that looks up `language.file` fails at compile time.
- Retained games, commands and save formats are unaffected. A Replay Viewer build keeps the packs it was built with.

## Alternatives considered

- Removing only the duplicates: the startup file would still carry card faces that no startup screen shows.
- Loading card text lazily with re-render on arrival: every synchronous `t()` caller on card screens would need a reactive store, and the screens would flash ids or English first.
- Keeping version 1 fields beside version 2: older consumers would silently miss card text instead of failing.
