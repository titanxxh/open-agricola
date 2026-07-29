# client/sandbox

`index.tsx` is the lazy entry for the Workshop sandbox UI. The sandbox starts
its test room through `POST /api/game/new-sandbox`; game rules remain
server-authoritative.

ESLint rule S6c reserves this directory as the only client boundary allowed to
import full `shared/session`, `shared/engine`, or card implementation modules.
The current entry does not use those imports.
