# Contributing to Open Agricola

[English](CONTRIBUTING.md) | [中文](CONTRIBUTING_zh.md)

Thank you for your interest in Open Agricola. Please read this guide before opening an issue or pull request.

## Development Environment

Prerequisites:

- **Node.js 24.15 or newer, excluding the Node 25 line.** `engines` declares `^24.15.0 || >=26.0.0`: `isolated-vm` 7 requires `node >= 24`, and `jsdom` 30 accepts only `^24.15.0 || >=26.0.0`, skipping Node 25 entirely. Native dependencies such as `better-sqlite3` are compiled against the Node ABI, so an older runtime causes a `NODE_MODULE_VERSION` mismatch.
- **pnpm.** The required version is pinned in the `packageManager` field of `package.json`; run `corepack enable` to select it automatically.
- **System libraries and build tools required by canvas.** Without them, `pnpm install` fails while compiling canvas:

  ```bash
  # Debian / Ubuntu
  sudo apt-get install -y build-essential pkg-config python3 \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev

  # macOS
  brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
  ```

Install dependencies and start the project:

```bash
pnpm install
./restart-local.sh    # Unified local development, runtime, and test entry point; starts backend (5175) and frontend (5173) on 127.0.0.1
./restart-local.sh --intranet   # Bind to the LAN IP instead, for testing from another machine
```

## Testing

The project has three test layers:

- **Unit** (`shared/**/__tests__/*.test.ts`) — pure domain logic.
- **Session** (`server/__tests__/*.test.ts`) — instantiate `GameSession` directly and assert `state`, `pending`, `log`, and `scores`. Rule correctness belongs at this layer.
- **E2E** (`e2e-tests/*.spec.ts`) — Playwright browser tests that require the frontend and backend to be running.

```bash
pnpm test:fast              # Fast projects; the CI default
pnpm test                   # Full Vitest suite: fast + slow
pnpm exec vitest run <file> # One test file
pnpm run test:e2e           # Playwright E2E
pnpm run lint               # ESLint; errors must be zero
```

After changing code, verify in this order: restart with `./restart-local.sh`, exercise the real behavior in a browser, run `pnpm test:fast`, then run `pnpm run lint`.

`./restart-local.sh` is the only shell script contributors need. `deploy-backend.sh` and `backup-offsite.sh` are maintainer-only: they operate the owner's production host and are not part of any contribution workflow.

## Architecture Boundaries

- The project has three layers: `shared/` for domain logic, `server/` for HTTP and WebSocket services, and `client/` for the React UI. The frontend renders and collects input; it **does not adjudicate rules**.
- Backend `GameSession` in `server/game/authoritative-session.ts` is the sole writer of `GameState`.
- Keep card behavior inside the card file whenever possible. Do not add per-card `if-else` branches to core files, create a centralized card-effect registry, or hard-code card rules in the frontend.

See [AGENTS.md](AGENTS.md) for the complete card workflow, implementation rules, and documentation synchronization requirements. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architecture details. Before changing a card, read [docs/CARD_TEST_TEMPLATE.md](docs/CARD_TEST_TEMPLATE.md) and provide the required test description.

## Commits and Pull Requests

- Use concise English commit subjects with one of these prefixes: `feat:`, `fix:`, `refactor:`, or `docs:`.
- Always rebase onto `main`; do not create merge commits.
- Before pushing, run `pnpm run lint` and `pnpm test:fast` locally.
- Card changes must update [docs/card_implementation_status.md](docs/card_implementation_status.md). Changes to shared extension points such as hook phases, ActionFlow nodes, or protocols must update [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Issues

Use the issue templates for bug reports and feature requests. For rule bugs found during a game, prefer the in-game Bug Report button because it automatically attaches the replay needed for diagnosis.
