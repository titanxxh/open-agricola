export const REPLAY_BRIDGE_PROTOCOL_VERSION = 1
export const REPLAY_BRIDGE_SCHEMA_VERSIONS = [1]

export type ReplayViewerManifest = {
  entrypoint: 'index.html'
  files: Record<string, string>
  bridge?: { protocolVersion: number; replaySchemaVersions: number[] }
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function validViewerPath(path: string): boolean {
  return !!path && !path.includes('\\') && path.split('/').every(part => !!part && part !== '.' && part !== '..')
}

export function readReplayViewerManifest(value: unknown): ReplayViewerManifest | null {
  if (!object(value) || value.entrypoint !== 'index.html' || !object(value.files)
    || !Object.hasOwn(value.files, 'index.html')) return null
  const entries: Array<[string, string]> = []
  for (const [path, hash] of Object.entries(value.files)) {
    if (path === 'manifest.json' || !validViewerPath(path) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return null
    entries.push([path, hash])
  }
  const files = Object.fromEntries(entries)
  if (value.bridge === undefined) return { entrypoint: 'index.html', files }
  if (!object(value.bridge) || !positiveInteger(value.bridge.protocolVersion)
    || !Array.isArray(value.bridge.replaySchemaVersions) || !value.bridge.replaySchemaVersions.length
    || !value.bridge.replaySchemaVersions.every(positiveInteger)) return null
  return { entrypoint: 'index.html', files, bridge: {
    protocolVersion: value.bridge.protocolVersion,
    replaySchemaVersions: value.bridge.replaySchemaVersions,
  } }
}

export function supportsReplayBridge(manifest: ReplayViewerManifest, schemaVersion: number): boolean {
  return manifest.bridge?.protocolVersion === REPLAY_BRIDGE_PROTOCOL_VERSION
    && manifest.bridge.replaySchemaVersions.includes(schemaVersion)
}
