# BGA/OA Cost-Pay Parity Report

BGA covered compute-cost cards: 39
Compared scenarios: 58
Compared card-purchase scenarios: 16
Compared construct scenarios: 18
Compared renovation scenarios: 15
Compared fencing scenarios: 6
Compared stables scenarios: 3
Differences: 12
Payment differences: 7
Source-only differences: 5
Report-only artifacts: 0

## A143 renovation stone discount

Kind: renovation
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "A143_Stonecutter"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "A143_Stonecutter"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": []
  }
]
```

## B128 plumber renovation choices

Kind: renovation
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "B128_Plumber"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "B128_Plumber"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": []
  }
]
```

## C122 renovation clay discount

Kind: renovation
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "clay": 2,
      "reed": 1
    },
    "sources": [
      "C122_Bricklayer"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 2,
      "reed": 1
    },
    "sources": [
      "C122_Bricklayer"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 1
    },
    "sources": []
  }
]
```

## C13 wood slide hammer stone discount

Kind: renovation
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": [
      "C13_WoodSlideHammer"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": [
      "C13_WoodSlideHammer"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 5
    },
    "sources": []
  }
]
```

## D121 clay plasterer fixed clay renovation

Kind: renovation
Difference type: source-diff

BGA:
```json
[
  {
    "resources": {
      "clay": 1,
      "reed": 1
    },
    "sources": [
      "D121_ClayPlasterer"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 1,
      "reed": 1
    },
    "sources": []
  }
]
```

## D13 trowel wood to stone fixed cost

Kind: renovation
Difference type: source-diff

BGA:
```json
[
  {
    "resources": {
      "reed": 3,
      "stone": 3,
      "food": 3
    },
    "sources": [
      "D13_Trowel"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 3,
      "stone": 3,
      "food": 3
    },
    "sources": []
  }
]
```

## D154 chimney sweep stone discount

Kind: renovation
Difference type: source-diff

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "D154_ChimneySweep"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": []
  }
]
```

## D81 roof ladder reed discount

Kind: renovation
Difference type: source-diff

BGA:
```json
[
  {
    "resources": {
      "clay": 3
    },
    "sources": [
      "D81_RoofLadder"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 3
    },
    "sources": []
  }
]
```

## D82 farm redevelopment fence discount

Kind: fencing
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "wood": 1
    },
    "sources": []
  },
  {
    "resources": {},
    "sources": [
      "D82_HuntingTrophy"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {},
    "sources": []
  }
]
```

## combo renovation trowel brushwood and millwright

Kind: renovation
Difference type: source-diff

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 1,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 2,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 1,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 2,
      "food": 2
    },
    "sources": [
      "D13_Trowel"
    ]
  },
  {
    "resources": {
      "stone": 1,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 2,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 2,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "stone": 1,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D13_Trowel",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "stone": 2,
      "food": 2
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D13_Trowel"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 1,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 2,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 1,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 2,
      "food": 2
    },
    "sources": []
  },
  {
    "resources": {
      "stone": 1,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 2,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 2,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "food": 2,
      "grain": 2
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "stone": 1,
      "food": 2,
      "grain": 1
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "stone": 2,
      "food": 2
    },
    "sources": [
      "B145_BrushwoodCollector"
    ]
  }
]
```

## combo fencing clay/free/grain alternatives

Kind: fencing
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "clay": 1
    },
    "sources": [
      "A16_RammedClay"
    ]
  },
  {
    "resources": {
      "grain": 1
    },
    "sources": [
      "A16_RammedClay",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1
    },
    "sources": []
  },
  {
    "resources": {},
    "sources": [
      "A88_HedgeKeeper"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 1,
      "grain": 1
    },
    "sources": [
      "A16_RammedClay",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1
    },
    "sources": [
      "A16_RammedClay"
    ]
  },
  {
    "resources": {
      "grain": 1
    },
    "sources": [
      "A88_HedgeKeeper",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1
    },
    "sources": []
  },
  {
    "resources": {},
    "sources": [
      "A88_HedgeKeeper"
    ]
  }
]
```

## combo stables clay alternative plus grain substitution

Kind: stables
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "clay": 1
    },
    "sources": [
      "C56_FeedFence"
    ]
  },
  {
    "resources": {
      "grain": 1
    },
    "sources": [
      "C56_FeedFence",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 2
    },
    "sources": []
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 1,
      "grain": 1
    },
    "sources": [
      "C56_FeedFence",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "grain": 2
    },
    "sources": [
      "C56_FeedFence",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1
    },
    "sources": [
      "C56_FeedFence"
    ]
  },
  {
    "resources": {
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 2
    },
    "sources": []
  }
]
```

