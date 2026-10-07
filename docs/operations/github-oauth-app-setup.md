# Workshop GitHub App setup and cutover

[English](github-oauth-app-setup.md) | [中文](github-oauth-app-setup_zh.md)

The historical filename is retained. Workshop submission OAuth is retired. One Workshop App submits bot PRs and reads reviews; login OAuth and the Bug Report App remain independent.

## Configure the existing Workshop Review App

1. In [GitHub App settings](https://github.com/settings/apps), open the installed Workshop Review App. Grant repository **Contents: Read and write**, **Pull requests: Read and write**, and automatic **Metadata: Read-only**. Install it only on `titanxxh/open-agricola`, and approve changed permissions on the installation page. Do not grant Workflows, Actions, Administration, or main-rule bypass.
2. Keep webhook URL `<PUBLIC_API_BASE>/api/github/webhook`, a dedicated secret, and only **Pull request** / **Pull request review** subscriptions. Verify Recent deliveries receive 2xx after deployment.
3. Set backend secrets. Existing names are retained for the same App:

   ```env
   WORKSHOP_PR_ENABLED=false
   GITHUB_UPSTREAM_OWNER=titanxxh
   GITHUB_UPSTREAM_REPO=open-agricola
   WORKSHOP_REVIEW_GITHUB_APP_ID=<App ID>
   WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID=<Installation ID>
   WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET=<Webhook secret>
   ```

4. The backend requests separate repository-scoped installation tokens: submission uses `contents:write,pull_requests:write`; review uses `contents:read,pull_requests:read`. This is purpose scoping within one App, not separate trust domains. A missing/revoked App stops writes; there is no PAT, maintainer-user or old OAuth fallback.

Never commit or log keys/tokens, or paste them into issues. `docker-compose.prod.yml` passes the App settings to the backend. Local use still starts through `./restart-local.sh`.

## Read-only inventory before cutover

With the target database and App configuration already in the shell environment:

```bash
pnpm exec tsx scripts/workshop-submission-inventory.ts > workshop-inventory.json
```

Run this against the actual target database, not just the GitHub PR list. It does not migrate schemas or change cards, grants, branches or PRs. The report contains card/version/head bindings, approved/live state, synthetic `owner:` approvals, current remote state and head repository classification (upstream, fork, detached or missing). Missing credentials and unavailable PR reads are explicit; they are not counted as absence. Confirm installed write permissions in GitHub settings as well as read-token readiness.

Review every synthetic approval before rollout. For an unmerged owner-authored PR, preserve the old history: the author explicitly unpublishes any live card, edits/reconfirms its version and chooses **重新投稿**. The new App PR requires a real authorized review; do not rename/copy the synthetic approval. Merged cards already included in a release remain under built-in takeover. Do not enable the cutover with unresolved live synthetic bindings: disabling OWNER synthesis changes how refresh/webhooks validate those records. This inventory and lifecycle decision must precede deployment of the changed review provider, not merely enabling submission writes.

Legacy resubmission compares pinned-version generated source/art with the old PR, ignoring only the source provenance header. Independent tests are retained. Missing versions or manual differences pause migration. A maintainer can integrate their changes into the author's draft and restore the saved generated baseline in the old PR before a fresh explicit submission. Retain a Git commit for the manual work. Do not make private forks public, detach/delete them or force-update them as part of cutover.

Migration 017 records offline synthetic approvals in the existing submission audit, clears their approval fields and marks them stale while retaining PR/version bindings. It stops deployment if any unmerged, non-built-in synthetic-approved card is still live. This makes the required inventory decision enforceable; rerunning the migration is idempotent.

## Enable and validate

After the inventory decisions and App setup, deploy the backend and set `WORKSHOP_PR_ENABLED=true`. As an ordinary site author, verify:

- A sandbox-confirmed, localized card opens a bot-authored PR without GitHub login or a personal fork; inspect the PR author and commit identity.
- Updating the card keeps the PR and preserves an independently added test. Editing generated source/art pauses with the original PR link. Draft/retarget pauses; a closed PR requires explicit resubmission.
- Drop a submission response and restart an application instance: reopening the modal reads the saved operation; **再次核实** resumes it. No new branch or blind PR POST is allocated for an uncertain result.
- A real authorized exact-head approval enables author publish before merge. A new head, dismissal or changes request removes that approval. New/migrated PRs never inherit earlier approvals.
- Inspect Actions for the actual bot PR head, wait for completion, and fix failures. Same-repository PR code must receive only read-only workflow tokens and no production secrets. Submission paths exclude `.github/workflows`; do not weaken main branch rules or authorize the App to bypass them. A passing local adapter test is not real GitHub acceptance.

The recovery worker makes at most four automatic attempts, respects Retry-After/rate reset hints and uses 30-second exponential backoff. **再次核实** starts another bounded reconciliation of the same operation after its waiting period. `creation_unknown` or `ambiguous_pr` requires a maintainer to locate the operation's branch/PR using the reported ID; never delete its ledger row to force a duplicate submission. Branch conflicts retain the expected old head. Restore that exact planned baseline or complete integration manually; recovery never adopts a new arbitrary head and overwrites it.

## Retire the old submission OAuth grant

The new backend removes `/api/workshop/github/oauth/start` and `/callback`, the popup handshake and encrypted token cache. Migration 016 drops only `workshop_oauth_handshakes`. Remove `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `WORKSHOP_TOKEN_ENCRYPTION_KEY` from deployment secrets and local service environments. Keep `ACCOUNT_GITHUB_OAUTH_*`, `ACCOUNT_GOOGLE_OAUTH_*` and all `BUG_REPORT_*` settings.

Deleting local ciphertext or reducing scope does **not** revoke GitHub-side authorization. Old submission tokens were consumed or expired locally, so there may be no token left to safely revoke through the API. Each affected author opens [Authorized OAuth Apps](https://github.com/settings/applications), identifies the old **Workshop submission OAuth App** by its registered name/owner, chooses **Revoke**, and verifies it disappeared. Do not revoke the separate login OAuth App or Bug Report GitHub App. The maintainer can then delete the retired submission OAuth App from Developer settings after verifying the application ID and retaining the inventory; deletion of an unrelated App is not part of this procedure.

## Rollback

Set `WORKSHOP_PR_ENABLED=false` to stop new delivery and background retries. Preserve PostgreSQL submission rows, drafts, versions and remote PRs; the same frozen operation can resume when configuration is repaired. Do not automatically remove remote branches, revert the database, or restore broad-scope submission OAuth. Review/webhook reconciliation remains independent of the write switch. A rollback to old code also needs an explicit credential/schema plan because migration 016 removed the retired token table; the operational rollback is to disable writes while keeping this schema.
