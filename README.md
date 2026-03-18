# flex-me-in

<p align="center">
  <a href="https://github.com/elodlukacs/flex-me-in/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/elodlukacs/flex-me-in/main.yml?branch=main&style=flat-square" alt="CI Status">
  </a>
  <a href="https://github.com/elodlukacs/flex-me-in/releases">
    <img src="https://img.shields.io/github/v/release/elodlukacs/flex-me-in?include_prereleases&style=flat-square" alt="Release">
  </a>
  <a href="https://github.com/elodlukacs/flex-me-in/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/elodlukacs/flex-me-in?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/elodlukacs/flex-me-in/stargazers">
    <img src="https://img.shields.io/github/stars/elodlukacs/flex-me-in?style=flat-square" alt="Stars">
  </a>
  <a href="https://github.com/elodlukacs/flex-me-in/fork">
    <img src="https://img.shields.io/github/forks/elodlukacs/flex-me-in?style=flat-square" alt="Forks">
  </a>
</p>

A powerful terminal-based TUI application for aggregating and filtering remote job listings from multiple job boards. Built specifically for senior frontend developers seeking remote opportunities.

![Demo](https://via.placeholder.com/800x400?text=flex-me-in+Demo)

## Features

- **Multiple Job Sources**: Aggregates jobs from 8+ remote job boards
- **AI-Powered Filtering**: Uses Claude AI to intelligently filter jobs based on remote work compatibility
- **Local Database**: Stores jobs locally using SQLite for fast access and persistence
- **Rich Filtering**: Filter by status, source, work type, title, company, and country
- **Job Descriptions**: View full job descriptions in a popup without leaving the terminal
- **Keyboard-Driven**: Full keyboard navigation for power users
- **Multiple Themes**: Choose from several color themes
- **Status Tracking**: Track jobs as new, applied, or ignored

## Supported Job Boards

- RemoteOK
- We Work Remotely
- Himalayas
- Remotive
- Arbeitnow
- LinkedIn
- Indeed
- Hacker News

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/elodlukacs/flex-me-in.git
cd flex-me-in

# Install dependencies
npm install

# Build the application
npm run build

# Run in development mode
npm run dev

# Or run the built version
npm start
```

### Global Installation

```bash
# Build and install globally
npm run build
npm link

# Now you can run from anywhere
flex-me-in
```

## Usage

### Basic Commands

| Key | Action |
|-----|--------|
| `f` | Fetch jobs from all sources |
| `j/k` or `↓/↑` | Navigate up/down |
| `←/→` or `PgUp/PgDn` | Previous/Next page |
| `Enter` | View job description |
| `Esc/q` | Close popup |
| `o` | Open job URL in browser |
| `a` | Toggle applied status |
| `i` | Toggle ignored status |
| `s` | Cycle status filter |

### Filtering

| Key | Action |
|-----|--------|
| `t` | Filter by title |
| `c` | Filter by company |
| `m` | Filter by country |
| `w` | Cycle work type filter |
| `u` | Cycle source filter |
| `x` | Clear all filters |

### AI & Views

| Key | Action |
|-----|--------|
| `g` | Run AI filter (remote detection) |
| `Tab` | Toggle between main list and AI panel |
| `1-9` | Filter by specific source |

### Other

| Key | Action |
|-----|--------|
| `y` | Change theme |
| `?` | Toggle help |
| `q` | Quit |

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Anthropic API Key for AI filtering (optional)
ANTHROPIC_API_KEY=your_api_key_here
```

### Data Storage

Jobs are stored in `~/.flex-me-in/jobs.db`
Configuration is stored in `~/.flex-me-in/config.json`

## Tech Stack

- **React** - UI framework
- **Ink** - Terminal UI library for React
- **TypeScript** - Type-safe JavaScript
- **SQLite** - Local database (better-sqlite3)
- **Claude AI** - AI-powered job filtering
- **tsup** - TypeScript bundler

## Project Structure

```
src/
├── api/              # API clients for job sources
├── components/      # React components
│   ├── filters/     # Filter UI components
│   ├── jobs/        # Job listing components
│   ├── fetch/       # Fetch progress components
│   └── layout/      # Layout components
├── db/              # Database operations
├── hooks/           # Custom React hooks
├── state/           # State management (reducer, context)
├── utils/           # Utility functions
└── app/             # Main app components
```

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## Acknowledgments

- [Ink](https://github.com/vadimdemedes/ink) - Terminal UI framework
- [RemoteOK](https://remoteok.com/) - Remote job listings
- [We Work Remotely](https://weworkremotely.com/) - Remote job listings
- [Claude AI](https://www.anthropic.com/claude) - AI for job filtering
