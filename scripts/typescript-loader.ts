import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const LOADER_FLAGS = new Set(['--import', '--require', '-r'])
const TYPESCRIPT_LOADER = /(?:^|[/\\])(?:tsx(?:[/\\@]|$)|typescript-runtime\.mjs$)/

/**
 * Node arguments that let a child process load this repository's TypeScript
 * the same way as the current process: the native preload in images, tsx in
 * development. Other execArgv entries (eval code, inspectors) are not copied.
 */
export function typescriptLoaderArgs(execArgv: readonly string[] = process.execArgv, cwd = process.cwd()): string[] {
  const loaders: string[] = []
  for (let index = 0; index < execArgv.length; index++) {
    const argument = execArgv[index]
    const separator = argument.indexOf('=')
    const flag = separator < 0 ? argument : argument.slice(0, separator)
    if (!LOADER_FLAGS.has(flag)) continue
    const value = separator < 0 ? execArgv[++index] : argument.slice(separator + 1)
    if (!value) continue
    // Children may run from another directory; relative preloads keep their meaning.
    loaders.push(flag === '-r' ? '--require' : flag, /^\.\.?[/\\]/.test(value) ? pathToFileURL(resolve(cwd, value)).href : value)
  }
  return loaders.some(value => TYPESCRIPT_LOADER.test(value)) ? loaders : ['--import', 'tsx']
}
