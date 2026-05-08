# client/sandbox

Boundary: this directory is the only place in `client/` that may import
`shared/session/`, `shared/engine/`, or `shared/cards/<deck>/...` impl files
(for the workshop hot-seat single-player mode).

ESLint rule (`eslint.config.js`, S6c) enforces this — main `client/**` files
outside `client/sandbox/` get a lint error if they reach into session/engine.

The lazy import boundary at `index.tsx` ensures Rollup splits
session+engine+cards-impl into a separate chunk so the main bundle stays small.
Workshop users incur a one-time async download when entering the workshop.
