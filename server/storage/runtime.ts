import { getDb } from '../db'
import { ResourceStore } from './resource-store'
import { S3ObjectStore } from './s3-store'

let resources: ResourceStore | undefined
export function getResources(): ResourceStore {
  return resources ??= new ResourceStore(getDb(), S3ObjectStore.fromEnv())
}
export function closeResources(): void { resources?.objects.close(); resources = undefined }
