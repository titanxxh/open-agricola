import { PR01 } from './PR01'
import { PR02 } from './PR02'
import { PR03 } from './PR03'
import { PR04 } from './PR04'
import { PR05 } from './PR05'
import { PR06 } from './PR06'
import { PR07 } from './PR07'
import { PR08 } from './PR08'
import { PR09 } from './PR09'
import { PR10 } from './PR10'
import { PR11 } from './PR11'
import { PR12 } from './PR12'
import type { MotherCardDefinition } from '../types'

export const motherParentCards = [
  PR01,
  PR02,
  PR03,
  PR04,
  PR05,
  PR06,
  PR07,
  PR08,
  PR09,
  PR10,
  PR11,
  PR12,
] as const satisfies readonly MotherCardDefinition[]
