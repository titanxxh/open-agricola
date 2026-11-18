// The owner's arm64 validator image for a formal cutover (ADR 0047). deploy-backend.sh runs on plain Node, so the
// isolated build (scripts/release/validator-image.ts) runs in a TypeScript-resolving child process.
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { typescriptLoaderArgs } from '../typescript-loader.ts'

/** Runs `validator-image.ts build` for the stable channel; resolves with its standard output. */
export type ValidatorBuild = (sourceSha: string) => Promise<string>

export const spawnValidatorBuild: ValidatorBuild = sourceSha => new Promise((done, fail) => {
  const child = spawn(process.execPath, [...typescriptLoaderArgs(), resolve(import.meta.dirname, 'validator-image.ts'), 'build', '--sha', sourceSha, '--channel', 'stable'],
    { stdio: ['ignore', 'pipe', 'inherit'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.once('error', fail)
  child.once('close', status => status === 0 ? done(output) : fail(new Error(`validator-image.ts build exited ${status}`)))
})

/**
 * The validator image ID for a cutover to `sourceSha`, reused or built before any maintenance begins. A cutover with
 * Owner-local Validation never falls back to host validation by itself: without the image it stops here, while the
 * old application still serves, and names the explicit host-validated path.
 */
export async function ownerValidatorImage(sourceSha: string, build: ValidatorBuild = spawnValidatorBuild): Promise<string> {
  try {
    const line = (await build(sourceSha)).trim().split('\n').at(-1) ?? ''
    const receipt: unknown = JSON.parse(line)
    if (!receipt || typeof receipt !== 'object') throw new Error('the build printed no receipt')
    const value = receipt as Record<string, unknown>
    if (value.kind !== 'owner-validator-image' || value.sourceSha !== sourceSha || value.channel !== 'stable' || value.platform !== 'linux/arm64'
      || typeof value.imageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.imageId)) throw new Error('the build printed a receipt for another image')
    return value.imageId
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Owner-local Validation needs the arm64 validator image of ${sourceSha} (ADR 0047), and ${message}. `
      + 'Nothing was sent to the backend. Fix it and rerun, or rerun with --full-maintenance to validate on the host', { cause: error })
  }
}
