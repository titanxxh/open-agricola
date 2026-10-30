import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

const root = resolve('data/encyclopedia-prototype')
mkdirSync(root, { recursive: true })
const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { env, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const envFile = resolve(root, 'test.env')
if (!existsSync(envFile)) {
  run('node', ['scripts/local-services.mjs', '--test'], { ...process.env, SHARED_DATA_DIR: root })
  const dependencies = parseEnv(readFileSync(resolve(root, 'dependencies.local'), 'utf8'))
  run('pnpm', ['exec', 'tsx', 'scripts/test-environment.ts', 'create', root], {
    ...process.env, ...dependencies, FRONTEND_PORT: '5194', BACKEND_PORT: '5196',
  })
}
const env = { ...process.env, ...parseEnv(readFileSync(envFile, 'utf8')) }
run('./restart-local.sh', process.argv.slice(2), env)
run('python3', ['docs/prototypes/encyclopedia/build-fixtures.py'])
console.info('\nEncyclopedia discussion prototype (16 representative entries):')
for (const variant of ['A', 'B', 'C']) console.info(`http://127.0.0.1:${env.FRONTEND_PORT}/?page=encyclopedia-prototype&variant=${variant}`)
