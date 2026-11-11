export const HOSTED_APP_PATH = '/open-agricola/'

export type AppLocationResponse =
  | { mode: 'disabled' }
  | { mode: 'canonical'; appUrl: string; buildId: string }

export type FrontendBuild = {
  format: 1
  gameBuildId: string
  basePath: '/' | typeof HOSTED_APP_PATH
} & (
  | { releaseChannel?: undefined; deploymentTarget?: undefined }
  | { releaseChannel: 'stable'; deploymentTarget: 'stable-hosted' | 'stable-pages' }
  | { releaseChannel: 'prerelease'; deploymentTarget: 'prerelease-hosted' }
)
