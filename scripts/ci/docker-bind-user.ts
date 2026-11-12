import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function dockerBindUser(): string {
  if (process.env.GITHUB_ACTIONS === 'true' && process.getuid?.() === 61000) {
    const path = '/run/oa-ci-isolation/context.json', metadata = lstatSync(path)
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (metadata.uid !== 0 || !metadata.isFile() || metadata.mode & 0o022 || typeof value !== 'object' || value === null
      || !('uid' in value) || value.uid !== 61000 || !('gid' in value) || value.gid !== process.getgid?.()
      || !('socket' in value) || value.socket !== '/run/user/61000/docker.sock' || process.env.DOCKER_HOST !== `unix://${value.socket}`) throw new Error('Invalid rootless CI bind identity')
    return '0:0'
  }
  return `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(dockerBindUser())
