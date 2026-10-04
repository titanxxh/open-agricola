export const ACTION_ICON_DESC: Record<string, string[]> = {
  // Base actions
  'farm-expansion':     ['5<wood>2<reed><arrow><room-wood>', '5<clay>2<reed><arrow><room-clay>', '5<stone>2<reed><arrow><room-stone>', '+', '2<wood> <arrow> <barn>'],
  'meeting-place':      ['<first> + 1<minor>'],
  'grain-seeds':        ['+1<grain>'],
  'farmland':           ['<field>'],
  'day-laborer':        ['+2<food>'],
  'lessons':            ['[actionBoard.labels.pay] 1<food>*', '1<occupation>'],
  'lessons-3':          ['[actionBoard.labels.pay] 2<food>', '1<occupation>'],
  'lessons-4':          ['[actionBoard.labels.pay] 2<food>*', '1<occupation>'],
  'resource-market':    ['+1<reed> / <stone> +1<food>'],
  'resource-market-4':  ['+1<reed>+1<stone>+1<food>'],
  'lessons-56-2f':      ['[actionBoard.labels.pay] 2<food>', '1<occupation>'],
  'lessons-56-variable': ['[actionBoard.labels.pay] 1/2<food>', '1<occupation>'],
  'modest-wish-children-56': ['<child>'],
  'house-building-56':  ['5<wood>2<reed><arrow><room-wood>', '5<clay>2<reed><arrow><room-clay>', '5<stone>2<reed><arrow><room-stone>'],
  'resource-market-56': ['+1<reed>+1<wood>+1<stone>'],
  'animal-market-56':   ['1<sheep>+1<food>', '/', '1<pig>', '/', '+1<cattle>-1<food>'],
  'farm-supplies-6':    ['[actionBoard.labels.pay] 1<food><arrow><field>', '[actionBoard.labels.andOr]', '[actionBoard.labels.pay] 1<food><arrow>1<grain>'],
  'resource-trade-6':   ['+1<food>', '+1<reed>/<stone>', '+1<wood>/<clay>'],
  'corral-6':           ['+1<sheep>/<pig>/<cattle>'],
  'side-job-6':         ['[actionBoard.labels.pay] 1<wood><arrow><barn>', '[actionBoard.labels.andOr]', '<bread>'],
  'improvement-6':      ['[actionBoard.labels.rounds1To4]: 1<minor>', '[actionBoard.labels.round5Onwards]: 1<major>/<minor>'],
  'moor-infirmary':     ['+1<food>', '[ui.infirmarySickWorkersOnly]'],
  'moor-resource-market-12': ['+1<food>+1<stone>'],
  // Round actions
  'fencing':            ['1<wood><arrow><fence-icon>'],
  'grain-utilization':  ['<sow> + <bread>'],
  'major-improvement':  ['1<major>/<minor>'],
  'vegetable-seeds':    ['+1<vegetable>'],
  'cultivation':        ['<field> + <sow>'],
  'wish-children':      ['<child> [▷] 1<minor>'],
  'urgent-wish-children': ['<child-free>'],
  'house-redevelopment':  ['<upgrade>', '[▷] 1<major>/<minor>'],
  'farm-redevelopment':   ['<upgrade>', '[▷] 1<wood><arrow><fence-icon>'],
  'sheep-market':       [],
  'pig-market':         [],
  'cattle-market':      [],
  'western-quarry':     [],
  'eastern-quarry':     [],
}

// Detailed icon-description shown inside the hover tooltip card body (the reference `tooltipDesc`).
// More verbose than ACTION_ICON_DESC (adds [text] labels); falls back to ACTION_ICON_DESC
// / gain display when an id is absent here.
export const ACTION_TOOLTIP_DESC: Record<string, string[]> = {
  'fencing':              ['[actionBoard.labels.buildFences]', '1<wood><arrow><fence-icon>'],
  'grain-utilization':    ['[actionBoard.labels.sow]', '<sow>', '[actionBoard.labels.andOr]', '[actionBoard.labels.bakeBread]', '<bread>'],
  'major-improvement':    ['[actionBoard.labels.buildImprovement]', '1<major>/<minor>'],
  'cultivation':          ['[actionBoard.labels.plowField]', '<field>', '[actionBoard.labels.andOr]', '[actionBoard.labels.sow]', '<sow>'],
  'wish-children':        ['<child> [actionBoard.labels.growthWithRoom]', '[actionBoard.labels.then]', '1<minor>'],
  'urgent-wish-children': ['<child-free> [actionBoard.labels.growthWithoutRoom]'],
  'house-redevelopment':  ['[actionBoard.labels.renovation]', '<upgrade>', '[actionBoard.labels.then]', '1<major>/<minor>'],
  'farm-redevelopment':   ['[actionBoard.labels.renovation]', '<upgrade>', '[actionBoard.labels.then]', '[actionBoard.labels.buildFences]', '1<wood><arrow><fence-icon>'],
}

// Full rule text shown to the right of the tooltip card (the reference `tooltip`).
// Falls back to the i18n short description when an id is absent here.
export const ACTION_TOOLTIP_TEXT: Record<string, string[]> = {
  'fencing': [
    'actionBoard.rules.fencingCost',
    'actionBoard.rules.fencingPastures',
  ],
  'sheep-market': ['actionBoard.rules.sheepAccumulation'],
  'grain-utilization': [
    'actionBoard.rules.sow',
    'actionBoard.rules.bakeBread',
  ],
  'major-improvement': ['actionBoard.rules.improvement'],
  'western-quarry': ['actionBoard.rules.westernQuarry'],
  'pig-market': ['actionBoard.rules.boarAccumulation'],
  'vegetable-seeds': ['actionBoard.rules.vegetableGain'],
  'eastern-quarry': ['actionBoard.rules.easternQuarry'],
  'cattle-market': ['actionBoard.rules.cattleAccumulation'],
  'wish-children': [
    'actionBoard.rules.growthWithRoom',
    'actionBoard.rules.growthRequired',
  ],
  'urgent-wish-children': [
    'actionBoard.rules.growthWithoutRoom',
    'actionBoard.rules.growthLaterRoom',
    'actionBoard.rules.growthOccupancy',
  ],
  'cultivation': [
    'actionBoard.rules.cultivation',
  ],
  'house-redevelopment': [
    'actionBoard.rules.houseRenovateFirst',
    'actionBoard.rules.houseRenovationOnce',
  ],
  'farm-redevelopment': [
    'actionBoard.rules.farmRenovateFirst',
    'actionBoard.rules.farmRenovationOnce',
  ],
}
