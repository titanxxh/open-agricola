/**
 * Vitest setup file — ensures the PR-2 transitional bootstrap in
 * `shared/cards/register-all.ts` runs once per worker before any test module
 * executes.
 *
 * Without this, tests that import a single card file for its side effects and
 * then read the legacy `getCardEffect` / `getRegisteredCardListeners` global
 * accessors (without constructing a `GameSession` first) would observe empty
 * registries — because after the `_impl`-export migration card files no longer
 * self-register at module load. The bootstrap at the bottom of `register-all.ts`
 * backfills the legacy maps from `ALL_CARD_IMPLS`.
 *
 * Why `GameSession` first: there is a pre-existing module cycle between
 * `shared/cards/catalog.ts` and `shared/cards/D/D95_SiteManager.ts` (via
 * `shared/game/minor-improvements.ts`). The cycle resolves correctly only when
 * `minor-improvements.ts` is pulled in before `catalog.ts` reaches its first
 * card import. Constructing the GameSession import path here forces the same
 * load order that `server/game-session.ts` would establish at first-use, so
 * `catalog.ts`'s top-level array is fully populated by the time
 * `register-all.ts`'s `import './catalog'` runs.
 *
 * Consumed via `vitest.config.ts` -> `test.setupFiles`.
 *
 * Removed in PR-3 once the legacy maps are deleted and every test that relied
 * on their auto-populated state has been updated to read through an explicit
 * `CardRegistry` (per-session).
 */
// Pull in GameSession first — this walks the real game-core import graph,
// which loads `minor-improvements.ts` before `catalog.ts` and avoids the
// D95_SiteManager <-> catalog TDZ bomb.
import '../../../server/game-session'
// Now load register-all for its bootstrap side effect.
import '../register-all'
