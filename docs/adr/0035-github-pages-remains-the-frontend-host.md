# 35. GitHub Pages remains the production frontend host

- Status: Accepted
- Date: 2026-10-29

The production application frontend remains hosted on GitHub Pages at `https://open-agricola.titanxxh.com/`; the API remains at `https://openagapi.titanxxh.com`. These HTTPS origins are same-site but cross-origin. Keep the API's host-only HttpOnly session cookie and credentialed CORS rather than moving the frontend to the API host or exposing persistent session credentials to JavaScript. Cookie site comparison uses the Public Suffix List, including private suffixes.

Account login must survive closing and reopening the browser until explicit logout or server-side session expiry. Authentication may temporarily navigate to the API origin, but returns the user to the GitHub Pages frontend before ordinary use. Permanent Game Context Links continue to exclude credentials as required by ADR 0013.

The previous API-hosted application entry redirects to the Pages frontend and preserves public Room and Replay link parameters. It clears authentication fragments rather than moving a tab-bound flow across origins. Browser-local preferences and drafts remain scoped to the origin where they were created. Public artwork and fonts remain on the separate asset site.
