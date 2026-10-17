import * as nodeFs from 'node:fs'

/** Audit scenarios write their probe evidence only during an explicit diagnostic run. */
const writesEnabled = () => process.env.AGRICOLA_TEST_DIAGNOSTIC === '1'

export * from 'node:fs'

export function mkdirSync(...args: Parameters<typeof nodeFs.mkdirSync>): ReturnType<typeof nodeFs.mkdirSync> {
  return writesEnabled() ? nodeFs.mkdirSync(...args) : undefined
}

export function writeFileSync(...args: Parameters<typeof nodeFs.writeFileSync>): void {
  if (writesEnabled()) nodeFs.writeFileSync(...args)
}

export function appendFileSync(...args: Parameters<typeof nodeFs.appendFileSync>): void {
  if (writesEnabled()) nodeFs.appendFileSync(...args)
}

export default { ...nodeFs, mkdirSync, writeFileSync, appendFileSync }
