import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve, dirname } from 'node:path'

const fixture = resolve('shared/cards/__tests__/card-environment')
for (const file of process.argv.slice(2)) {
  if (!/\.test\.tsx?$/.test(file)) throw new Error(`Expected a test file: ${file}`)
  const source = readFileSync(file, 'utf8')
  if (source.includes('useOfficialCardRegistry')) continue
  let modulePath = relative(dirname(resolve(file)), fixture).replaceAll('\\', '/')
  if (!modulePath.startsWith('.')) modulePath = `./${modulePath}`
  const prefix = `import { useOfficialCardRegistry } from '${modulePath}'\n\nuseOfficialCardRegistry()\n\n`
  const pragma = source.match(/^\/\/ @vitest-environment[^\n]*\n/)
  const offset = pragma?.[0].length ?? 0
  writeFileSync(file, `${source.slice(0, offset)}${prefix}${source.slice(offset)}`)
}
