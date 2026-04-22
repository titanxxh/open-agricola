export const workshopPrConfig = {
  enabled: process.env.WORKSHOP_PR_ENABLED === 'true',
  clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
  clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '',
  upstreamOwner: process.env.GITHUB_UPSTREAM_OWNER ?? 'titanxxh',
  upstreamRepo: process.env.GITHUB_UPSTREAM_REPO ?? 'open-agricola',
  callbackPath: '/api/workshop/github/oauth/callback',
}

/**
 * True iff the workshop -> PR integration is enabled AND credentials are present.
 * When false, all /api/workshop/github/* and /api/workshop/cards/:id/propose
 * endpoints should return 503. UI shows no "Propose to main repo" button.
 */
export function workshopPrEnabled(): boolean {
  return workshopPrConfig.enabled
    && workshopPrConfig.clientId.length > 0
    && workshopPrConfig.clientSecret.length > 0
}
