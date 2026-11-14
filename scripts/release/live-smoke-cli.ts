import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLiveSmokeConfig, readPrivateAcceptanceFile, runLiveReleaseSmoke } from './live-smoke'

export async function liveSmokeCli(args: string[]): Promise<void> {
  const execute = args.includes('--execute')
  const remaining = args.filter(value => value !== '--execute')
  if (args.filter(value => value === '--execute').length > 1 || remaining.length !== 2 || remaining[0] !== '--config' || !remaining[1]) {
    throw new Error('Usage: release:accept --config <private-config.json> [--execute]')
  }
  const config = parseLiveSmokeConfig(JSON.parse(readPrivateAcceptanceFile(resolve(remaining[1]))))
  if (!execute) {
    console.log(JSON.stringify({ status: 'plan-only', ...config, engines: ['chromium', 'webkit'], credentialValuesRead: false,
      gameWritesPermitted: false, accountCreated: false, permittedWrites: ['own-session login/logout', 'anonymous telemetry', 'selected existing participant room routing'] }))
    return
  }
  let proxy
  if (process.env.RELEASE_SMOKE_PROXY) {
    const url = new URL(process.env.RELEASE_SMOKE_PROXY)
    if (!['http:', 'socks5:'].includes(url.protocol) || !['', '/'].includes(url.pathname) || url.search || url.hash) throw new Error('Invalid acceptance proxy')
    proxy = { server: `${url.protocol}//${url.host}`, ...(url.username ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : {}) }
  }
  const report = await runLiveReleaseSmoke(config, { proxy })
  console.log(JSON.stringify({ status: 'accepted', expectedBuild: report.expectedBuild, browsers: report.browsers.map(browser => browser.engine),
    gamesCreated: report.gamesCreated, gameplayCommands: report.gameplayCommands, outputDirectory: config.outputDirectory }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  liveSmokeCli(process.argv.slice(2)).catch(() => {
    console.error('Live acceptance failed; inspect the private result and first-failure evidence.')
    process.exitCode = 1
  })
}
