import { register } from 'tsx/esm/api'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { parentPort, workerData } from 'node:worker_threads'

register()
const { PostgresDatabase } = await import('../../../server/database/postgres.ts')
const { createPrereleaseAuthorityHandler } = await import('../../../server/prerelease-authority-routes.ts')
const { requestSessionToken } = await import('../../../server/request-auth.ts')
const { PrereleaseAuthority, configuredPrereleaseTarget } = await import('../../../server/prerelease-authority.ts')
const db = new PostgresDatabase({ connectionString: workerData.connectionString })
const handler = createPrereleaseAuthorityHandler({ db, getSourceToken: async req => requestSessionToken(req) })
const server = createServer((req, res) => {
  void handler(req, res).then(handled => { if (!handled) res.writeHead(404).end() })
    .catch(() => res.writeHead(500).end())
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
parentPort.postMessage({ base: `http://127.0.0.1:${server.address().port}` })
parentPort.on('message', async request => {
  if (request.kind === 'issue') {
    try {
      const issued = await new PrereleaseAuthority(db).issue(request.token, configuredPrereleaseTarget(), request.input)
      parentPort.postMessage({ code: issued.code })
    } catch { parentPort.postMessage({ failed: true }) }
    return
  }
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await db.close()
  parentPort.postMessage({ stopped: true })
  parentPort.close()
})
