import { RoomDirectory } from './room-directory'
import { ExecutionAccess, type ExecutionStamp } from './execution-access'

/** Standalone HTTP sessions remain node-affine, with shared revocation guards. */
export class SandboxAuthority {
  readonly access: ExecutionAccess
  readonly directory: RoomDirectory
  readonly instanceId: string
  constructor(directory: RoomDirectory, instanceId: string) {
    this.directory = directory; this.instanceId = instanceId
    this.access = new ExecutionAccess(directory.db)
  }
  async check(stamp: ExecutionStamp): Promise<void> { await this.publish(stamp, () => {}) }
  async publish<T>(stamp: ExecutionStamp, send: () => T): Promise<T> {
    return this.directory.db.transaction(async () => {
      await this.directory.assertInstance(this.instanceId)
      await this.access.assert(stamp)
      return send()
    })()
  }
}
