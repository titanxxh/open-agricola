import { PS01 } from './PS01'
import { PS02 } from './PS02'
import { PS03 } from './PS03'
import { PS04 } from './PS04'
import { PS05 } from './PS05'
import { PS06 } from './PS06'
import { PS07 } from './PS07'
import { PS08 } from './PS08'
import { PS09 } from './PS09'
import { PS10 } from './PS10'
import { PS11 } from './PS11'
import { PS12 } from './PS12'
import type { FatherCardDefinition } from '../types'

export const fatherParentCards = [
  PS01,
  PS02,
  PS03,
  PS04,
  PS05,
  PS06,
  PS07,
  PS08,
  PS09,
  PS10,
  PS11,
  PS12,
] as const satisfies readonly FatherCardDefinition[]
