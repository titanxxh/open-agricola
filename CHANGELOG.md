# Changelog

## [0.1.0.0] - 2026-03-29

### Added
- **User system**: Registration, login, session tokens (`crypto.scrypt` + `timingSafeEqual`), rate limiting
- **SQLite persistence**: `better-sqlite3` with auto-migration, replacing JSON file state. Rooms survive server restarts.
- **Lobby**: Room listing, creation, joining; rooms linked to authenticated users
- **Page routing**: `?page=login|lobby|workshop|game` URL parameter routing via `PageRouter`
- **WebSocket auth**: Auth handshake on WS connection; player names synced from login session
- **Card Workshop**: Browse, create, edit, publish, like, comment on custom cards
- **Custom card DSL**: Declarative JSON effects (`gain`, `pay-resources`, `bonus-vp`, etc.) compiled to `ActionFlow`
- **TypeScript card code**: AST validation + VM sandbox (100ms timeout) for user-written TS card effects
- **Card .ts pipeline**: DSL/code → generated `.ts` file following official card patterns; dynamic `import()` at game start
- **Card version history**: Full audit trail with revert support
- **Featured cards page**: Admin-curated featured cards
- **LLM card designer**: Browser-side AI card design via OpenAI/Anthropic (API keys never leave browser)
- **Card art generation**: DALL-E 3 art generation with upload to `/card-art/` (5MB limit)
- **Sandbox mode**: Single-player test games with custom workshop cards
- **Multiplayer with custom cards**: WS `createRoom` accepts `customCardIds`
- **Production deployment**: Dockerfile + docker-compose, GitHub Pages workflow for frontend
- **Admin role**: `ADMIN_USERS` env var, admin-only featured toggle

### Fixed
- URL params read at module level (now reactive)
- Game-over room status not updating in SQLite
- Back-to-lobby navigation
- Dev mode defaulting to on

### Security
- `timingSafeEqual` buffer length guard (prevent throw on corrupt hash)
- Versions endpoint requires auth + ownership check
- Like endpoint verifies card visibility (no draft leak)
- CORS origin configurable via `CORS_ORIGIN` env var
- Art upload capped at 5MB
- `maxPlayers` clamped to [2, 4] from client input
- Pagination count query fixed (LIKE params no longer dropped)
