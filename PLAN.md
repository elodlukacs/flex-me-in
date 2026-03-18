# fe-hunt Enhancement Plan

## Job Sources (APIs to Add)

| Source | API Type | Priority |
|--------|----------|----------|
| **LinkedIn** | Scraping/Unofficial API | High |
| **Indeed** | RSS/Scraping | High |
| **Glassdoor** | Scraping | Medium |
| **Hacker News "Who's Hiring"** | Official API | Medium |
| **Jooble** | RSS/API | Low |
| **RemoteOK JSON Feed** | Already integrated | ✅ Done |
| **WeWorkRemotely** | Already integrated | ✅ Done |
| **Remotive** | Already integrated | ✅ Done |
| **ArbeitNow** | Already integrated | ✅ Done |
| **Himalayas** | Already integrated | ✅ Done |

## Core Features to Add

### 1. Application Tracking System (ATS)
- Track jobs applied to with status: `applied` → `interview` → `offer` → `rejected`
- Store: date applied, company response, notes, salary range
- Filter by application status

### 2. Resume Integration
- Store multiple resume versions
- Match jobs against resume using AI (already have Claude integration - expand)
- Score jobs based on skill match

### 3. Job Alerts & Monitoring
- Background fetch on interval (cron-like)
- Desktop notifications for new matching jobs
- Filter jobs by: new (<24h), today, this week

### 4. Company Research
- Store company info: size, tech stack, funding, reviews
- Link to company website
- Track if previously applied/ignored

### 5. Enhanced AI Filtering
- Multiple AI providers (OpenAI, Anthropic, Ollama local)
- More filters: salary range, experience level, tech stack
- Batch processing with progress

### 6. Export/Sharing
- Export to JSON/CSV
- Generate application summary report
- Share filtered list

## UI Improvements

### 7. Better Navigation
- Search within results
- Sort by: date, company, relevance
- Save filter presets

### 8. Multi-select Actions
- Select multiple jobs for bulk actions
- Bulk mark as applied/ignored
- Bulk open URLs

## Developer Tools Integration

### 9. Company Tech Stack Detection
- Detect tech stack from job description
- Flag: React, Vue, Angular, Next.js, TypeScript, etc.
- Match against your skills

### 10. Salary Data
- Parse salary ranges from listings
- Display converted to local currency
- Filter by salary range

## Data & Storage

### 11. Backup/Sync
- Export database to file
- Import from backup
- Cloud sync (optional)

### 12. Job Caching
- Cache job descriptions locally
- View full description in-app
- Search within description

## Suggested Implementation Order

1. **High Impact**: Add LinkedIn + Indeed sources, ATS tracking
2. **Medium Impact**: Resume integration, search/sort, saved filters
3. **Lower Impact**: Export, backups, company database

## Useful External Tools to Consider

- **Apify** - Ready-made scrapers for many job sites
- **SerpAPI** - Google Jobs search
- **Rss feeds** - Many job boards offer RSS
- **Indeed Publisher API** - Official Indeed integration
