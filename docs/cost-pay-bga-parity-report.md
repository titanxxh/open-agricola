# BGA/OA Cost-Pay Parity Report

BGA covered compute-cost cards: 39
Compared scenarios: 58
Compared card-purchase scenarios: 16
Compared construct scenarios: 18
Compared renovation scenarios: 15
Compared fencing scenarios: 6
Compared stables scenarios: 3
Differences: 35

## A27 oven fixed cost

Kind: card-purchase

BGA:
```json
[
  {
    "resources": {
      "clay": 1,
      "stone": 1
    },
    "sources": [
      "A27_OvenSite"
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
      "stone": 1
    },
    "sources": [
      "A27_OvenSite"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "stone": 1
    },
    "sources": []
  }
]
```

## A75 card-purchase wood bonus

Kind: card-purchase

BGA:
```json
[
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "A75_LumberMill"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "A75_LumberMill"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": []
  }
]
```

## E130 overachiever resource choice discount

Kind: card-purchase

BGA:
```json
[
  {
    "resources": {
      "wood": 2,
      "clay": 1,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 1,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 1,
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 1,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 1,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E130_Overachiever"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": []
  }
]
```

## combo card-purchase basket fixed price plus stone and wood modifiers

Kind: card-purchase

BGA:
```json
[
  {
    "resources": {
      "reed": 2,
      "stone": 1,
      "food": 1
    },
    "sources": [
      "A143_Stonecutter",
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 2,
      "food": 1
    },
    "sources": [
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "C95_BasketWeaver",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "C95_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 2
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
      "reed": 2,
      "stone": 1,
      "food": 1
    },
    "sources": [
      "A143_Stonecutter",
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 2,
      "food": 1
    },
    "sources": [
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter",
      "D117_WoodExpert",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "C95_BasketWeaver",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "C95_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "D117_WoodExpert",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": []
  }
]
```

## A128 riparian construct discount

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "clay": 4,
      "reed": 2
    },
    "sources": [
      "A128_RiparianBuilder"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
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
      "clay": 4,
      "reed": 2
    },
    "sources": []
  }
]
```

## A149 house artist reed discount

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "wood": 5,
      "reed": 1
    },
    "sources": [
      "A149_HouseArtist"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2
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
      "wood": 5,
      "reed": 1
    },
    "sources": []
  }
]
```

## B126 carpenter fixed room cost

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "wood": 3,
      "reed": 2
    },
    "sources": [
      "B126_Carpenter"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2
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
      "wood": 3,
      "reed": 2
    },
    "sources": []
  }
]
```

## B13 carpenter parlor fixed wood room cost

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "wood": 2,
      "reed": 2
    },
    "sources": [
      "B13_CarpentersParlor"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2
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
      "wood": 2,
      "reed": 2
    },
    "sources": []
  }
]
```

## C128 wooden hut extender round cost

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "wood": 3,
      "reed": 1
    },
    "sources": [
      "C128_WoodenHutExtender"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2
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
      "wood": 3,
      "reed": 1
    },
    "sources": []
  }
]
```

## C88 apprentice wood room discount

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "wood": 3,
      "reed": 2
    },
    "sources": [
      "C88_CarpentersApprentice"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2
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
      "wood": 3,
      "reed": 2
    },
    "sources": []
  }
]
```

## D121 clay plasterer fixed clay room cost

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "clay": 3,
      "reed": 2
    },
    "sources": [
      "D121_ClayPlasterer"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
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
      "clay": 3,
      "reed": 2
    },
    "sources": []
  }
]
```

## D88 millwright construct bonuses

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "wood": 5,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 4,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 4,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 3,
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2
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
      "wood": 5,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 4,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 4,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 3,
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 3,
      "reed": 1,
      "grain": 3
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 4,
      "grain": 3
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 3,
      "grain": 4
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 5,
      "reed": 2
    },
    "sources": []
  }
]
```

## E123 construct top resource choices

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "clay": 4,
      "reed": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
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
      "clay": 3,
      "reed": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "clay": 4,
      "reed": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "clay": 4,
      "reed": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
    },
    "sources": []
  }
]
```

## E150 rock beater stone room discount

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "reed": 2,
      "stone": 3
    },
    "sources": [
      "E150_RockBeater"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 5
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
      "reed": 2,
      "stone": 3
    },
    "sources": []
  }
]
```

## A123 renovation frame replacement

Kind: renovation

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 1,
      "wood": 1
    },
    "sources": [
      "A123_FrameBuilder"
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

OA:
```json
[
  {
    "resources": {
      "wood": 1,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "A123_FrameBuilder"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "reed": 1,
      "stone": 3
    },
    "sources": [
      "A123_FrameBuilder"
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

## A143 renovation stone discount

Kind: renovation

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

## B145 brushwood renovation reed replacement

Kind: renovation

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "clay": 3
    },
    "sources": []
  },
  {
    "resources": {
      "wood": 1,
      "clay": 3
    },
    "sources": [
      "B145_BrushwoodCollector"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 3,
      "reed": 1
    },
    "sources": []
  },
  {
    "resources": {
      "wood": 1,
      "clay": 3
    },
    "sources": [
      "B145_BrushwoodCollector"
    ]
  }
]
```

## C122 renovation clay discount

Kind: renovation

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "clay": 2
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

## C14 straw roof removes renovation reed

Kind: renovation

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "clay": 3
    },
    "sources": []
  },
  {
    "resources": {
      "clay": 3
    },
    "sources": [
      "C14_StrawThatchedRoof"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 3,
      "reed": 1
    },
    "sources": []
  },
  {
    "resources": {
      "clay": 3
    },
    "sources": [
      "C14_StrawThatchedRoof"
    ]
  }
]
```

## D121 clay plasterer fixed clay renovation

Kind: renovation

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

## D88 millwright renovation bonuses

Kind: renovation

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 3,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
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

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 3,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 3,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 1,
      "grain": 3
    },
    "sources": [
      "D88_Millwright"
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

## E123 renovation top resource choices

Kind: renovation

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": [
      "E123_ResourceHoarder"
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

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": []
  },
  {
    "resources": {
      "stone": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "stone": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "stone": 3
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  }
]
```

## E87 master renovator flagged choices

Kind: renovation

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "E87_MasterRenovator"
    ]
  },
  {
    "resources": {
      "stone": 3
    },
    "sources": [
      "E87_MasterRenovator"
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
      "E87_MasterRenovator"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": [
      "E87_MasterRenovator"
    ]
  },
  {
    "resources": {
      "stone": 3
    },
    "sources": [
      "E87_MasterRenovator"
    ]
  }
]
```

## D82 farm redevelopment fence discount

Kind: fencing

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

## D88 millwright fence bonuses

Kind: fencing

BGA:
```json
[
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
  }
]
```

OA:
```json
[
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
  }
]
```

## D88 millwright stable bonuses

Kind: stables

BGA:
```json
[
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
      "grain": 2
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
      "wood": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "grain": 1
    },
    "sources": [
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
      "wood": 2
    },
    "sources": []
  }
]
```

## combo construct clay room replacement plus grain substitution

Kind: construct

BGA:
```json
[
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 2,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 2,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 2,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 2,
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 3,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 3,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "grain": 2
    },
    "sources": [
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 3,
      "reed": 2
    },
    "sources": [
      "A123_FrameBuilder"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 2
    },
    "sources": [
      "D121_ClayPlasterer"
    ]
  },
  {
    "resources": {
      "clay": 4,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 4,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
    },
    "sources": []
  },
  {
    "resources": {
      "wood": 1,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D121_ClayPlasterer",
      "D88_Millwright"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "reed": 1,
      "grain": 3
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "grain": 3
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 1,
      "grain": 4
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 2
    },
    "sources": [
      "A123_FrameBuilder"
    ]
  },
  {
    "resources": {
      "clay": 2,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 2,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 2,
      "grain": 3
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "grain": 2
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "clay": 3,
      "reed": 2
    },
    "sources": []
  },
  {
    "resources": {
      "wood": 1,
      "reed": 2,
      "grain": 1
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "reed": 1,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "grain": 2
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "grain": 3
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "grain": 3
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "grain": 4
    },
    "sources": [
      "A123_FrameBuilder",
      "D88_Millwright"
    ]
  }
]
```

## combo renovation trowel brushwood and millwright

Kind: renovation

BGA:
```json
[
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
      "food": 2,
      "grain": 1
    },
    "sources": [
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
      "grain": 1
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D88_Millwright"
    ]
  },
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
      "reed": 1,
      "food": 2,
      "grain": 3
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "stone": 1,
      "food": 2,
      "grain": 3
    },
    "sources": [
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "food": 2,
      "grain": 3
    },
    "sources": [
      "B145_BrushwoodCollector",
      "D88_Millwright"
    ]
  },
  {
    "resources": {
      "food": 2,
      "grain": 4
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
      "clay": 1
    },
    "sources": [
      "A16_RammedClay"
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

## combo stables clay alternative plus grain substitution

Kind: stables

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
      "wood": 1,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
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
      "clay": 1
    },
    "sources": [
      "C56_FeedFence"
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
      "wood": 2,
      "grain": 1
    },
    "sources": [
      "D88_Millwright"
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
      "wood": 2
    },
    "sources": []
  }
]
```

