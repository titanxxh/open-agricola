import { pathToFileURL } from 'node:url'
import { provisionOperationsDatabase } from './database-access.ts'

async function main() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  const config: unknown = JSON.parse(text)
  if (!config || typeof config !== 'object' || !('databaseUrl' in config) || typeof config.databaseUrl !== 'string'
    || !('password' in config) || typeof config.password !== 'string' || !/^[a-f0-9]{64}$/.test(config.password)) {
    throw new Error('Invalid operations database provisioning input')
  }
  await provisionOperationsDatabase({ databaseUrl: config.databaseUrl, password: config.password })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main()
  } catch {
    console.error('Operations database access provisioning failed')
    process.exitCode = 1
  }
}
