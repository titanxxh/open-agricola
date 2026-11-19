import { execFileSync } from 'node:child_process'
import { nativeContainerImageId } from '../release/container-images-archive.ts'
import { CONTAINER_IMAGE_REGISTRY } from '../release/container-images.ts'

const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
export const runtimePinPath = 'deploy/prerelease-runtime.ref'
export type RuntimePin = { recipeTree: string; image: string; configDigest: string; manifestDigest: string }

export function parseRuntimePin(value: unknown): RuntimePin {
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 1
    || !('recipeTree' in value) || typeof value.recipeTree !== 'string' || !/^[a-f0-9]{40}$/.test(value.recipeTree)
    || !('image' in value) || typeof value.image !== 'string' || !('configDigest' in value) || !digest(value.configDigest)) {
    throw new Error('Expected an immutable prerelease runtime pin with manifest and config digests')
  }
  const [repository, manifest, extra] = value.image.split('@')
  if (repository !== CONTAINER_IMAGE_REGISTRY || !digest(manifest) || extra !== undefined) throw new Error('Invalid prerelease runtime registry pin')
  return { recipeTree: value.recipeTree, image: value.image, configDigest: value.configDigest, manifestDigest: manifest }
}

export function approvedRuntimePin(repository: string, buildId: string): RuntimePin {
  if (!/^[a-f0-9]{40}$/.test(buildId)) throw new Error('Expected a fixed source commit')
  function read(revision: string) {
    let raw: string
    try {
      raw = execFileSync('git', ['--no-replace-objects', 'show', revision + ':' + runtimePinPath], {
        cwd: repository, encoding: 'utf8', maxBuffer: 8192, stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch { throw new Error('Publish the prerelease runtime, commit its pin to protected main, and sync the candidate before updating') }
    const pin = parseRuntimePin(JSON.parse(raw))
    const tree = execFileSync('git', ['--no-replace-objects', 'rev-parse', '--verify', revision + ':deploy/prerelease-runtime'], { cwd: repository, encoding: 'utf8' }).trim()
    if (tree !== pin.recipeTree) throw new Error('Runtime recipe changed. Promote the new runtime pin before updating pre')
    return pin
  }
  const selected = read(buildId)
  const approved = read('HEAD')
  if (selected.recipeTree !== approved.recipeTree || selected.image !== approved.image || selected.configDigest !== approved.configDigest) throw new Error('Prerelease runtime differs from the trusted policy pin')
  return selected
}

export function installedRuntime(pin: RuntimePin, docker: (args: string[]) => string): { image: string; available: boolean } {
  const image = nativeContainerImageId(pin, docker)
  // An empty exact-ID lookup signifies a cache miss; a Docker error remains an error.
  const known = docker(['image', 'ls', '--all', '--quiet', '--no-trunc', '--filter', 'label=io.open-agricola.prerelease-runtime=1']).split(/\s+/)
  if (!known.includes(image)) return { image, available: false }
  const value: unknown = JSON.parse(docker(['image', 'inspect', '--format', '{{json .}}', image]))
  if (!value || typeof value !== 'object' || !('Id' in value) || value.Id !== image
    || !('Os' in value) || value.Os !== 'linux' || !('Architecture' in value) || value.Architecture !== 'amd64'
    || !('Config' in value) || !value.Config || typeof value.Config !== 'object' || !('Labels' in value.Config)
    || !value.Config.Labels || typeof value.Config.Labels !== 'object' || !('io.open-agricola.prerelease-runtime' in value.Config.Labels)
    || value.Config.Labels['io.open-agricola.prerelease-runtime'] !== '1') throw new Error('Installed image differs from the approved runtime')
  return { image, available: true }
}
