# client/sandbox

`index.tsx` is the lazy entry for the Workshop sandbox UI. Playtests run only
in the browser engine Worker under `client/local-sandbox/` (ADR 0052);
`POST /api/game/new-sandbox` runs only deployed cards.

ESLint rule S6c reserves this directory as the only client boundary allowed to
import full `shared/session`, `shared/engine`, or card implementation modules.
The current entry does not use those imports.
