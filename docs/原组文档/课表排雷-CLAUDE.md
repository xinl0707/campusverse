# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**课表智能分析系统** - A web-based course schedule analyzer for college freshmen using AI to detect scheduling patterns, analyze study risks, and provide visual insights.

## Commands

### Start Development Server
```bash
cd /Users/hongyutong/Desktop/02_工具组
npm install
node server.js
```

Access at: `http://localhost:3000/tools/`

### Run Tests
Not applicable - this is a frontend-focused project without automated tests.

### Build/Lint
Not configured - vanilla JS project using ES6+ syntax directly.

### Environment Setup
1. Create `.env` file if missing:
   ```env
   MIMO_API_KEY=your_api_key_here
   PORT=3000
   ```
2. Never commit the `.env` file - it's in `.gitignore`

## Architecture

### Directory Structure
```
02_工具组/
├── common/               # Shared resources
│   ├── css/
│   │   ├── variables.css  # Design system tokens
│   │   └── components.css # Reusable UI components
│   └── js/
│       ├── utils.js       # Utility functions (storage, formatting)
│       └── ai-proxy.js    # AI API wrapper
├── tools/                # Main tool application
│   ├── index.html        # Entry point
│   ├── css/
│   │   └── tool-style.css # Tool-specific styles
│   └── js/
│       ├── app.js        # Application entry point
│       └── modules/      # Feature modules
│           ├── schedule.js  # Schedule data management
│           ├── analysis.js  # Pattern detection & risk analysis
│           └── viz.js       # Data visualization (radar charts)
├── package.json          # Dependencies (express, cors, dotenv)
├── server.js             # Express backend with AI proxy
├── .env                  # API credentials (DO NOT COMMIT)
└── README.md             # Documentation
```

### Key Components

**Backend (server.js)**
- Express server serving static files from root
- `/api/chat` endpoint proxies requests to MIMO AI API
- Prevents exposing API keys in client code

**Frontend Modules:**

1. **schedule.js** - Course data management
   - ICS calendar file parsing
   - LocalStorage persistence via StorageManager
   - CRUD operations for courses

2. **analysis.js** - Intelligent pattern detection
   - `detectSpecialPatterns()`: Single/double week, short-term alerts
   - `identifyHighWeightCourses()`: Mandatory/fixed-point course ranking
   - `detectScheduleRisks()`: Early morning streaks, evening overload
   - `analyzeFragmentTime()`: Fragmented free-time identification

3. **viz.js** - Visualization layer
   - Radar chart rendering for 5-dimension analysis
   - Calendar view grid layout
   - Risk indicator cards

4. **app.js** - Application orchestrator
   - File upload handlers (ICS, images)
   - Event binding and routing
   - Renders module outputs

5. **ai-proxy.js** - AI integration
   - Wraps MIMO API calls through backend proxy
   - JSON response sanitization (`parseAiJson`)
   - OCR prompt building for image recognition

### Design System

All styling uses CSS custom properties from `variables.css`:
- Primary colors: Purple gradient theme (`#667eea`, `#764ba2`)
- Bright, modern aesthetic suitable for students
- Visual fallback gradients for image loading failures
- Responsive breakpoints at 1024px, 768px, 640px

### Data Models

**Course Object:**
```javascript
{
  id: string,
  name: string,
  day: number (1-7),
  startTime: "HH:mm",
  endTime: "HH:mm",
  location: string,
  weekType: "每周" | "单周" | "双周" | "隔周",
  durationWeeks: number,
  credits?: number
}
```

**Analysis Result:**
```javascript
{
  specialPatterns: [{type, label, description, severity}],
  highWeightCourses: [{name, weightScore, reasons}],
  scheduleRisks: [{type, label, description, severity}],
  fragmentTime: {hasFragments, totalFragmentDays, fragments[]},
  visualizationData: {...},
  recommendations: []
}
```

### State Management

Uses `StorageManager` wrapper around localStorage with `tools_` prefix:
- `ScheduleManager.dataKey = 'schedule_data'`
- Auto-serializes/deserializes on save/load

## Common Tasks

### Adding a New Analysis Rule
1. Open `tools/js/modules/analysis.js`
2. Add method to class following existing pattern
3. Integrate into `analyze()` return object
4. Update visualization in `viz.js` or HTML template

### Adding Upload Format Support
1. Add file input element in `tools/index.html`
2. Implement handler in `app.js` → `handle[X]Upload()`
3. Convert format to standard course array
4. Call `ScheduleManager.save(courses)`

### Styling Updates
- Modify CSS variables in `common/css/variables.css` for global changes
- Add component overrides in `tools/css/tool-style.css`

### AI Integration Pattern
```javascript
// In any module
const messages = [/* system + user messages */];
const response = await callAI(messages);
const result = parseAiJson(response);
if (!result) return getDefaultData();
```

## Important Notes

- **Never expose API keys** - Always route through `/api/chat` proxy
- **Visual degradation** - Use gradient backgrounds as fallbacks
- **Browser compatibility** - ES6+ features require modern browsers
- **File uploads** - Images converted to Base64 before OCR
- **No build step** - All JavaScript runs directly in browser

## Dependencies

- `express`: Web server
- `cors`: Cross-origin support  
- `dotenv`: Environment variable loading
- `Chart.js` (CDN): Optional chart library

## Testing Checklist

- [ ] Schedule imports successfully via ICS
- [ ] Special patterns detected correctly
- [ ] Risks flagged with appropriate severity
- [ ] Visualization renders without errors
- [ ] Toast notifications display properly
- [ ] Mobile responsive layout works

## Team Roles (Reference Only)

| Member | Module |
|--------|--------|
| 严锦程 | Schedule analysis + backend |
| 章晗植 | Diary module + prompts |
| 洪宇佟 | Mood module + viz |
