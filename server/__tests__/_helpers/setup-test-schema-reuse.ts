import { afterAll } from 'vitest'
import { enableTestSchemaReuse } from './postgres'

// fast-server: tests in one file share migrated schemas, reset between tests (see createTestDatabase).
const dropSchemas = enableTestSchemaReuse()
afterAll(dropSchemas)
