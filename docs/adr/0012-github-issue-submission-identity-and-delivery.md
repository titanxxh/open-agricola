# 12. Bug reports use a dedicated least-privilege GitHub App

- Status: Accepted
- Date: 2026-07-27

## Context

A Game Bug Reporter must be able to submit a symptom and Bug Report Anchor from inside a game to the public `titanxxh/open-agricola`. Players with a GitHub account want to be the Issue author; players without one need hosted submission. Both paths need limited permissions and must survive revocation, rate limits and uncertain GitHub responses without losing the report or creating duplicates. Site login OAuth only proves identity, and GitHub's Create Issue API has no idempotency key.

## Decision

- A dedicated public GitHub App is installed only on `titanxxh/open-agricola` with `Issues: write` as its only write permission. Owner, repository ID and installation ID are server configuration, never client input. Login OAuth, Workshop credentials and personal tokens are not used.
- **Author identity.** A player's own submission uses a GitHub App user access token, so the player is the author; they confirm first that GitHub shows that account publicly and that site deletion cannot anonymize it. Without a usable Issue Submission Connection, the player may explicitly choose Hosted Issue Identity (installation token, author `[bot]`). An invalid connection never switches author automatically, and switching to hosted submission needs another confirmation.
- The Issue Submission Connection is separate from site login and binds the site user to GitHub's immutable numeric user ID. One GitHub user ID connects to only one site user; if the site account already has a GitHub login identity, the two IDs must match. Connecting never adds a GitHub login method.
- **Authorization.** Random `state` and PKCE `S256`; one live Bug Report state per user. The callback only validates state and passes code and state in the frontend URL fragment; the frontend completes in its original top-level context, and the server consumes the state for the current site user before exchanging the code. Tokens are encrypted in PostgreSQL (AES-256-GCM, per-row nonce, `keyId`) and never reach the browser, URLs, logs, Issues or the repository. User tokens expire (8 hours, refresh 6 months, rotated atomically). App secrets and keys are deployment secrets; installation tokens are generated on demand and never stored. Disconnect, refresh failure, revocation webhooks or `401` invalidate the connection and delete local tokens.
- **Content.** A Bug Report Draft and immutable `submissionId` are persisted before submission. The trimmed symptom has 1–2000 Unicode characters; the server builds the title, strips control characters and disables `@mention` notifications. The body holds the symptom, an identity-free marker `<!-- open-agricola-report:{submissionId} -->` and the approved locators (site `userId`, `playerIndex`, `roomId`, lifecycle, version, `stepNo`, Frame Hash). It may also include bounded, untrusted client diagnostics: device type, browser name and version, and at most five WebSocket close observations from this Room in the last hour, including timestamp, code, reason and clean-close flag. Reporter identity always comes from the authenticated server session. No raw User-Agent, hidden information, state, tokens, email, mutable names or raw payloads are attached.
- **Delivery.** One executor claims each `submissionId`. After a network error or `5xx`, it pages recent Issues back to the attempt start looking for the marker before retrying. `401` asks for reconnection; `403` / `429` with a reset time are queued; other `403`s stop; network and `5xx` retry after 30 s, 2 min and 10 min; `410` / `422` never retry; three failures need a manual retry with the same draft. A lost browser response rereads the authoritative status.
- **Quotas.** At most 5 open drafts per user; 3 submissions per 10 minutes and 10 per day per user; 5 per user per Room; 30 per Room; a site-wide GitHub window of 20 requests per minute. Retries of one `submissionId` do not count again.
- Only the same `submissionId` is deduplicated; an existing open Issue for the same Anchor is shown, and the player chooses to open it or submit anyway.
- Only a logged-in user seated in the target Room, with a Replay Step Anchor available, can create or retry a draft; otherwise the API returns `bug_report_anchor_unavailable`.
- **Deletion.** Disconnect or account deletion revokes and deletes tokens immediately. Deletion first replaces the site `userId` in known Issue bodies with "deleted reporter" (ADR 0010) and reconciles abandoned submitted reports by marker; it succeeds only after GitHub confirms the body no longer contains the ID. After success only `submissionId`, `roomId`, Issue number and status are kept; attempt logs last 30 days and never hold tokens or raw responses.

## Consequences

- Own and hosted submission share one least-privilege App, and the player always chooses the author identity explicitly.
- Login, Workshop delivery and Bug Issue submission stay three separate authorization chains.
- Durable drafts, one executor, stable markers and pre-retry reconciliation reduce duplicates, but strict exactly-once is not claimed.
- Triage automation lives in the repository (`bug-report-triage.yml`), not in user token permissions.

## Alternatives considered

- Reusing site login OAuth: couples authentication with external writes.
- Reusing Workshop credentials: broader permissions than `Issues: write`.
- A maintainer personal token: long-lived credential and wrong author.
- No refresh token: breaks connect-once usability.
- Falling back to `[bot]` when a connection fails: changes the public author without consent.
- Merging Issues by Anchor or text: one Step can show different symptoms.
- Treating retries as new submissions: duplicates Issues and bypasses quotas.

References: GitHub documentation on [user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [issues](https://docs.github.com/en/rest/issues/issues) and [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
