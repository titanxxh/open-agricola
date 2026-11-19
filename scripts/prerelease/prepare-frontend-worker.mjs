// A miniature Vite entry asks the actual application plugins to emit one production worker.
// A new process for each entry releases Rolldown's native allocations between the large TypeScript bundles.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'

const [worker, directory] = process.argv.slice(2)
if (process.env.RELEASE_CHANNEL !== 'prerelease' || process.env.OA_PREPARED_FRONTEND_WORKERS || !directory ||
    !['card-tests', 'sandbox'].includes(worker)) throw new Error('Expected an independent prerelease worker preparation')
const entry = 'virtual:prerelease-prepare-worker'
const input = worker === 'sandbox' ? 'import url from "/client/local-sandbox/worker.ts?worker&url"; console.log(url)'
  : 'import * as tests from "/client/local-sandbox/card-tests.ts"; console.log(tests)'
// vite.config.ts selects production data defines using the CLI build argument.
process.argv.push('build')
const result = await build({
  publicDir: false,
  build: { write: false, rolldownOptions: { input: entry } },
  plugins: [{
    name: 'prepare-prerelease-worker',
    resolveId(id) { if (id === entry) return '\0' + entry },
    load(id) { if (id === '\0' + entry) return input },
  }],
})
const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output ?? [])
const pattern = worker === 'sandbox' ? /^assets\/worker-[\w-]+\.js$/ : /^assets\/card-tests\.worker-[\w-]+\.js$/
const bundles = outputs.filter(output => output.type === 'asset' && pattern.test(output.fileName))
if (bundles.length !== 1) throw new Error('Expected one native Vite ' + worker + ' worker')
const [bundle] = bundles
writeFileSync(join(directory, worker + '.js'), bundle.source, { flag: 'wx' })
if (worker === 'sandbox') writeFileSync(join(directory, 'sandbox-name'), bundle.fileName, { flag: 'wx' })
