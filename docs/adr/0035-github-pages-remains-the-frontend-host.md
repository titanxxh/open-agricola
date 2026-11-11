# 35. GitHub Pages remains the production frontend host

- Status: Accepted
- Date: 2026-10-29

The production application frontend remains hosted on GitHub Pages at `https://open-agricola.titanxxh.com/`; the API remains at `https://openagapi.titanxxh.com`. These HTTPS origins are same-site but cross-origin. Keep the API's host-only HttpOnly session cookie and credentialed CORS rather than moving the frontend to the API host or exposing persistent session credentials to JavaScript. Cookie site comparison uses the Public Suffix List, including private suffixes.

Account login must survive closing and reopening the browser until explicit logout or server-side session expiry. Authentication may temporarily navigate to the API origin, but returns the user to the GitHub Pages frontend before ordinary use. Permanent Game Context Links continue to exclude credentials as required by ADR 0013.

The previous API-hosted application entry redirects to the Pages frontend and preserves public Room and Replay link parameters. It clears authentication fragments rather than moving a tab-bound flow across origins. Browser-local preferences and drafts remain scoped to the origin where they were created. Public artwork and fonts remain on the separate asset site.

## Prerelease entry

The separate prerelease origin uses hosted `/open-agricola/` while production remains at the Pages root. Lobby and Settings expose its configured entry only to qualified accounts, in a new tab. A pre-created verifier remains in a pre host-only HttpOnly cookie. The main handoff page carries only a browser challenge and bounded state, then sends a one-minute, single-use code to the fixed callback fragment. Formal login credentials never leave the formal API host. Missing configuration or owner activation keeps entry unavailable; pre-local authentication and final opening require their own acceptance.
