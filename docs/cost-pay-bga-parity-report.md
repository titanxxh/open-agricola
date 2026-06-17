# BGA/OA Cost-Pay Parity Report

BGA covered compute-cost cards: 39
Compared scenarios: 58
Compared card-purchase scenarios: 16
Compared construct scenarios: 18
Compared renovation scenarios: 15
Compared fencing scenarios: 6
Compared stables scenarios: 3
Differences: 7
Payment differences: 7
Source-only differences: 0
Report-only artifacts: 0

## E123 card-purchase top resource choices

Kind: card-purchase
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "wood": 1,
      "reed": 1
    },
    "sources": [
      "E123_ResourceHoarder"
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
      "E123_ResourceHoarder"
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
      "E123_ResourceHoarder"
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
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "reed": 1
    },
    "sources": [
      "E123_ResourceHoarder"
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
      "E123_ResourceHoarder"
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
Difference type: payment-diff

BGA:
```json
[
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
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver"
    ]
  }
]
```

## E123 construct top resource choices

Kind: construct
Difference type: payment-diff

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

## E123 renovation top resource choices

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
    "sources": []
  }
]
```

## B15 carpenters bench constrained free fence

Kind: fencing
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {},
    "sources": [
      "B15_CarpentersBench"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "wood": 1
    },
    "sources": []
  }
]
```

## combo renovation trowel brushwood and millwright

Kind: renovation
Difference type: payment-diff

BGA:
```json
[
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

