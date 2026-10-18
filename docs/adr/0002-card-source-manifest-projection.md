# 2. Card Source with manifest projection

- Status: Accepted
- Date: 2026-06-04

## Context

A card author wants one file for a card's display information and its rules, while the main frontend bundle must never import card runtime code, which would pull listeners, effects, modifiers and their dependencies into the browser. The old split between `shared/cards-display/` and `shared/cards/` scattered the author's entry point and let implementation fields such as `modifier(s)` leak into the display layer.

## Decision

- A **Card Source** is the single author entry for every card in `shared/cards/{A..E,M,major,community}/`. It declares `meta` and optional `impl`.
- `meta` is the Card Definition: serializable, frontend-visible and free of runtime behavior. `impl` is the Card Impl used by the server and sandbox: modifiers, listeners, effects, `prerequisiteCheck` and `reaches`.
- `scripts/build-cards-manifest.ts` extracts `meta` statically with the TypeScript AST into `public/cards-manifest.json`; the frontend reads Card Display only through `client/services/card-meta`. `meta` therefore holds only JSON-like literals and simple same-file constants.
- The generated `shared/cards/catalog.generated.ts` holds Card Definition metadata only. The server and sandbox load native implementations from the generated `ALL_CARD_IMPLS` in `shared/cards/register-all.ts`, and major cards through `major/runtime.generated.ts`. Card Definitions are plain data distinguished by `kind`, not class instances.

## Consequences

- Base, major, Moor and community cards share one model. Ordinary cards keep one file per card; a major-family file may export several physical Card Sources, which the generators discover.
- Implementation fields cannot reach Card Display or the manifest.
- Building the manifest never executes card modules.

## Alternatives considered

- A generated `shared/cards-display/` shadow directory: keeps two catalogs to reason about.
- Tree-shaking or conditional exports from the same module: any bundler drift could pull `impl` back into the main bundle.
- Importing the generated catalog at build time and serializing it: executes Card Sources and weakens frontend isolation.
