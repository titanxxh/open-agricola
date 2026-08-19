# Registering the GitHub OAuth App for Workshop Pull Requests

[English](github-oauth-app-setup.md) | [中文](github-oauth-app-setup_zh.md)

This guide is for the repository maintainer (`titanxxh`). Complete this setup before deploying the application.

## Setup

1. Open [https://github.com/settings/applications/new](https://github.com/settings/applications/new).
2. Enter:
   - Application name: **Open Agricola Workshop**
   - Homepage URL: `https://titanxxh.github.io/open-agricola/`
   - Authorization callback URL:
     - Development: `http://localhost:5175/api/workshop/github/oauth/callback`
     - Production: `https://<backend-host>/api/workshop/github/oauth/callback`
     - Current production example: `https://your-game.duckdns.org:8443/api/workshop/github/oauth/callback`
   - You may configure multiple callback URLs, one for each environment.
3. Click **Register application**.
4. On the application page, click **Generate a new client secret**. Copy and store the Client ID and Client Secret immediately; the secret cannot be viewed again after leaving the page.
5. Add the secret to the backend environment:

   ```env
   GITHUB_OAUTH_CLIENT_ID=<Client ID>
   GITHUB_OAUTH_CLIENT_SECRET=<Client Secret>
   GITHUB_UPSTREAM_OWNER=titanxxh
   GITHUB_UPSTREAM_REPO=open-agricola
   WORKSHOP_PR_ENABLED=true
   # When the production frontend is hosted on GitHub Pages, the backend
   # needs its own public URL to construct the OAuth callback URL.
   PUBLIC_API_BASE=https://your-game.duckdns.org:8443
   ```

   - Development: store these values in `.env`, which is already ignored by Git.
   - Production: inject them through Docker secrets or environment variables.
6. Verify the configuration after starting the service. `GET /api/workshop/github/oauth/start?hs=test` must return a 302 redirect to `github.com/login/oauth/authorize`.

## Scope

The application requests the `repo` scope so it can read repository contents, create branches, and submit pull requests when the upstream repository is private. If the upstream repository becomes public, reduce this to `public_repo`.

## Workshop Review GitHub App

Pull-request approval reads and webhooks use a separate GitHub App. Do not reuse either the Workshop OAuth App or the issues-only Bug Report App.

### Registration and Installation

1. Create a GitHub App named `open-agricola-workshop-review` and set its homepage URL to the main repository.
2. Set repository permissions to `Contents: Read-only` and `Pull requests: Read-only`. Leave all other permissions at `No access`, except GitHub's automatic `Metadata: Read-only` permission.
3. Set the Webhook URL to `<PUBLIC_API_BASE>/api/github/webhook`. Generate a dedicated secret with `openssl rand -hex 32`.
4. Under **Subscribe to events**, select only `Pull request` and `Pull request review`.
5. Select **Only on this account** for the installation scope and install the app only on `titanxxh/open-agricola`.
6. Record the App ID, generate and download a private key, and record the Installation ID from the installation page URL.

After adding `Contents: Read-only` to an existing installation, approve the permission change on the App installation page. Until approval, installation tokens will not receive that permission.

This App does not participate in user OAuth and needs no callback URL, Client ID, or Client Secret. Disable **Webhook Active** before `POST /api/github/webhook` is deployed. Re-enable it after deployment and confirm that Recent deliveries return 2xx.

### Backend Configuration

Add these variables to the backend deployment environment. The current production configuration is stored in `/root/open-agricola/.env`:

```env
WORKSHOP_REVIEW_GITHUB_APP_ID=<App ID>
WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID=<Installation ID>
WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET=<Webhook secret>
```

Store private-key newlines as `\n`. The private key and webhook secret may exist only in backend deployment secrets: never commit them, log them, or paste them into an issue. Issues may record only variable names, configuration locations, and the installed repository. `docker-compose.prod.yml` explicitly passes these four variables into the backend container.

## Runtime Flow

1. The author clicks **Submit for review** on a card detail page.
2. The frontend calls `POST /api/workshop/cards/:id/submit-review`.
3. If the server has no GitHub token, it returns an OAuth start URL.
4. The frontend opens that OAuth URL in a popup. In production, the popup URL must resolve to the backend host, not a GitHub Pages path; the frontend uses `VITE_API_BASE` as its base URL.
5. The backend returns an HTML page from the GitHub callback that runs:

   ```js
   window.opener.postMessage({ type: 'workshop-pr-oauth', result }, '*')
   ```

   The target origin must be `'*'` because the callback page is served by the backend host while the opener is hosted on GitHub Pages.
6. The frontend receives the message, closes the popup, and retries `submit-review`.
7. The server:
   - Uses the upstream repository directly when the authorized user is the upstream owner, skipping the fork.
   - Otherwise ensures that the user's fork exists.
   - Reads `shared/cards/register-all.ts`, `shared/cards/catalog.generated.ts`, and `docs/community_cards.md`.
   - Generates the community card file, registries, community documentation, and optional card art. The pull request adds behavior tests according to risk.
   - Creates a V1 commit with a placeholder pull-request number and opens or updates the pull request.
   - Creates a V2 commit containing the real pull-request number.
8. The Review App receives the webhook. An approved review pins the reviewed revision only after a GraphQL snapshot confirms that the pull request is open, not a draft, and targets `main`. A different current head, `dismissed`, `CHANGES_REQUESTED`, or a closed unmerged pull request makes the previous qualification stale.
9. When the author calls `POST /api/workshop/cards/:id/publish`, the server queries GraphQL again and marks the card live only if the result still matches.

## CI Requirements for Generated Pull Requests

Generated community-card pull requests must pass the full CI suite, especially:

```bash
pnpm run check:community-deck
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run build
```

Common generator failures and their fixes:

| Symptom | Cause | Fix location |
|---|---|---|
| `deck` check fails | Workshop card still has `deck: 'CUSTOM'` | `server/workshop-pr/code-gen.ts` normalizes the deck to `community` |
| `localeCompare` or listener sorting fails | Listener has no stable `id` | Generator assigns `{cardId}-listener-{n}` to listeners without an ID |
| `catalog.generated.ts is out of sync` | Generated catalog was not committed | Run `pnpm run generate:register-all` and commit `catalog.generated.ts` and `major/generated.ts` |
| TypeScript rejects `phases: string[]` | `CARD_IMPL` has no contextual type | Generator annotates `CARD_IMPL` as `CardImpl` |
| TypeScript rejects `prerequisite` | Workshop JSON used a structured prerequisite | Generator converts `{ occupation: N }` into prerequisite text plus `occupationPrerequisites` |

## Troubleshooting

### OAuth reports `redirect_uri is not associated with this application`

The GitHub OAuth App's Authorization callback URL does not match the callback constructed by the server. Check:

- The production callback is configured in the GitHub App: `https://your-game.duckdns.org:8443/api/workshop/github/oauth/callback`.
- The backend `PUBLIC_API_BASE` and reverse-proxy HTTPS address are correct.
- The `redirect_uri` parameter in the GitHub authorization URL opened by the browser exactly matches the GitHub App setting.

### The popup closes after authorization, but no pull request is created

Check the callback HTML's `postMessage` target origin first. Production is cross-origin: the backend callback page sends a message to the GitHub Pages opener, so it must use `'*'`. If it uses `window.location.origin`, the frontend never receives the message and does not retry the proposal.

### Forking fails when the authorized user is the upstream owner

GitHub does not allow users to fork their own repositories. `GitHubClient.ensureFork()` must return the upstream owner and repository directly when `login === upstreamOwner`, without calling the fork API.

## Revocation

If a secret is exposed:

1. Click **Revoke all user tokens** on the application page.
2. Click **Generate a new client secret**.
3. Update `GITHUB_OAUTH_CLIENT_SECRET` in the backend environment.
4. Restart the service.
