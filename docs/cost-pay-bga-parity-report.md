# BGA/OA Cost-Pay Parity Report

BGA covered compute-cost cards: 39
Compared scenarios: 58
Compared card-purchase scenarios: 16
Compared construct scenarios: 18
Compared renovation scenarios: 15
Compared fencing scenarios: 6
Compared stables scenarios: 3
Differences: 2
Payment differences: 2
Source-only differences: 0
Report-only artifacts: 0

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

