# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-driven college life simulation game: players make decisions across 8 semesters (48 total events), with AI-generated outcomes and end-of-game MBTI analysis comparing self-assessed vs behavior-inferred personality types.

## Quick Start

```bash
cd main
npm install
copy .env.example .env   # Windows - add your MIMO_API_KEY
npm start                # Starts server on http://localhost:3000/simulator/
```

## Architecture

### Core Directory Structure

```
main/
├── server.js              # Backend: Express server with AI proxy endpoint (/api/chat)
├── .env                   # API credentials (NOT committed to git)
├── package.json           # Dependencies: express, cors, dotenv
│
├── common/                # Shared resources
│   ├── css/
│   │   ├── variables.css  # Design tokens (colors, fonts, spacing)
│   │   └── components.css # Reusable UI components
│   └── js/
│       ├── utils.js       # StorageManager, clamp, escapeHtml helpers
│       └── ai-proxy.js    # callAI() & parseAiJson() wrappers
│
└── simulator/             # Game implementation
    ├── index.html         # Single-page application
    ├── css/sim-style.css  # Simulator-specific styles
    └── js/
        ├── app.js         # Main orchestration: screen flow, event rendering, player interactions
        ├── game-engine.js # Game state management: stats, clock, achievements, save/load
        └── ai-service.js  # AI prompt builders & fallback event pools
```

### Key Design Patterns

**AI Integration:**
- All AI calls go through `server.js` `/api/chat` endpoint (never expose API keys in frontend)
- Model config: `mimo-v2.5` with `thinking: { type: 'disabled' }` to suppress reasoning content
- JSON responses use two-phase parsing: try raw → sanitize (`+10` → `10`, remove trailing commas) → retry

**Game State Management (game-engine.js):**
- Event queue with semester-matching filter for preloading optimization
- Category quota system: 学业 6 / 实践 7 / 宿舍 8 / 运动 9 / 社交 9 / 娱乐 9 (prevents AI from over-generating academic events)
- BalanceDelta algorithm: symmetric soft boundaries prevent early stat caps/flattening
- Special event triggers: crisis (<10 stats) or peak (>95 stats) with cooldown per semester

**Player Interaction Flow:**
1. Welcome page (录取通知书 design) → Create character (MBTI dimension picker)
2. Opening monologue → Event display → Choice selection → Result feedback
3. Every 6th event → Semester summary with radar chart + key choices recap
4. End of 48th event → Final report (MBTI comparison, achievement badges, timeline, destination)

**Critical Files to Know:**

| File | Purpose | Key Functions |
|------|---------|---------------|
| `ai-service.js` | AI prompts + fallbacks | `generateEvent()`, `judgeCustomAction()`, `analyzeMbti()`, `analyzeDestination()` |
| `game-engine.js` | State engine | `applyEffects()`, `balanceDelta()`, `checkSpecialTrigger()`, `pickDestination()` |
| `app.js` | UI orchestration | `enterEvent()`, `chooseOption()`, `showSemesterSummary()`, `startFinalSummary()` |
| `server.js` | Backend proxy | `/api/chat` POST endpoint with thinking suppression |

## Common Development Tasks

### Run the game
```bash
cd main
npm start
# Visit http://localhost:3000/simulator/
```

### Test event generation balance (dev tool)
```bash
cd main
node dev-balance-test.js  # Simulates 400 games with random choices
```

### Debug custom action judge
```bash
cd main
node dev-custom-judge-test.js  # Tests AI judgment of user inputs
```

### Check static syntax
```bash
node --check server.js
node --check common/js/*.js
node --check simulator/js/*.js
```

## Important Constraints

1. **No API keys in commits** - `.env` files must exist locally but never commit
2. **Thinking mode must be disabled** - Using `thinking: { type: 'disabled' }` in server.js (not just `enable_thinking: false`)
3. **JSON parsing requires sanitization** - Handle cases like `"study": +10` with `sanitizeJson()` fallback
4. **Category quotas are enforced at engine level** - AI receives category hint but cannot override quota allocation
5. **Special events bypass preloading** - Crisis/peak events use direct Promise pattern, not eventQueue

## Related Documentation

- `technical-framework.md` - Full technical architecture & AI configuration details
- `project-design.md` - Detailed game mechanics & business logic specifications
- `bug.md` - Known issues & fixes log
- `todo.md` - Current development backlog & priorities
