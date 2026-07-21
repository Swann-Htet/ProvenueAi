<div align="center">
  <img src="client/dist/logo.png" alt="ProvenueAI" width="160"/>

  <h1>ProvenueAI</h1>
  <p><strong>AI-powered site intelligence &amp; financial simulation for Thai SME restaurants</strong></p>

  <p>
    <a href="https://six.skillfusion.tech" target="_blank">
      <img src="https://img.shields.io/badge/Live_Demo-six.skillfusion.tech-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo"/>
    </a>
    <a href="https://hub.docker.com/u/louiscore" target="_blank">
      <img src="https://img.shields.io/badge/Docker_Hub-louiscore-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Hub"/>
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-True_Corporation_Proprietary-c8102e?style=for-the-badge&logo=truecaller&logoColor=white" alt="License"/>
    </a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-20_LTS-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"/>
    <img src="https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white" alt="Express"/>
    <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL"/>
    <img src="https://img.shields.io/badge/NVIDIA_NIM-LLM-76b900?style=flat-square&logo=nvidia&logoColor=white" alt="NVIDIA NIM"/>
    <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>
    <img src="https://img.shields.io/badge/Nginx-Alpine-009639?style=flat-square&logo=nginx&logoColor=white" alt="Nginx"/>
  </p>
</div>

---

> **Access Restricted** — This repository is the exclusive property of **True Corporation PCL**.
> Unauthorized access, use, or distribution is strictly prohibited. See [LICENSE](LICENSE) for details.

---

## Overview

**ProvenueAI** is a two-sided AI platform that connects Thai SME restaurant owners with location intelligence and financial feasibility analysis. Admins source and publish available property listings; restaurant owners describe their business through a form or voice interview to receive a fully AI-generated **Site Intelligence Report**.

```
Admin  →  Property Sourcing Agent  →  Curated Listings DB
User   →  18-field Business Profile  →  NVIDIA NIM Report Engine
                                     →  Site Score + Financial Forecast + Pricing
                                     →  Post-Report Q&A Agent (Live Map Updates)
```

---

## Live Demo

<a href="https://six.skillfusion.tech">
  <img src="https://img.shields.io/badge/Open_Live_App-six.skillfusion.tech-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white"/>
</a>

---

## Docker Images

Images are published to Docker Hub under [`louiscore`](https://hub.docker.com/u/louiscore):

| Image | Description |
|---|---|
| [`louiscore/provenueai-backend`](https://hub.docker.com/r/louiscore/provenueai-backend) | Node.js 20 API server + Playwright |
| [`louiscore/provenueai-frontend`](https://hub.docker.com/r/louiscore/provenueai-frontend) | Nginx serving static frontend |

```bash
docker pull louiscore/provenueai-backend
docker pull louiscore/provenueai-frontend
```

---

## Key Features

| Feature | Description |
|---|---|
| <img src="https://cdn.simpleicons.org/homeadvisor/6366f1" width="16"/> **Property Sourcing Agent** | Admin types an area; AI scrapes and structures candidate listings from public sources |
| <img src="https://cdn.simpleicons.org/googlepodcasts/6366f1" width="16"/> **Voice Interview Agent** | Conversational STT-driven onboarding fills all 18 business profile fields |
| <img src="https://cdn.simpleicons.org/nvidia/76b900" width="16"/> **Report Generation (NVIDIA NIM)** | Site scoring across 6 dimensions, financial forecast (3 scenarios), menu pricing matrix |
| <img src="https://cdn.simpleicons.org/openstreetmap/7EBC6F" width="16"/> **Post-Report Insight Agent** | Natural-language map Q&A — ask a question, watch the map update live |
| <img src="https://cdn.simpleicons.org/jsonwebtokens/000000" width="16"/> **JWT Auth** | Separate Admin and User roles with secure session management |
| <img src="https://cdn.simpleicons.org/websocket/010101" width="16"/> **Real-time Messaging** | WebSocket-powered chat between admin and users |

---

## Tech Stack

| Layer | Technology |
|---|---|
| <img src="https://cdn.simpleicons.org/html5/E34F26" width="14"/> **Frontend** | Vanilla HTML + CSS + JavaScript (multi-page) |
| <img src="https://cdn.simpleicons.org/node.js/339933" width="14"/> **Backend** | Node.js 20 + Express (ESM) |
| <img src="https://cdn.simpleicons.org/jsonwebtokens/000000" width="14"/> **Auth** | JWT + bcryptjs |
| <img src="https://cdn.simpleicons.org/websocket/010101" width="14"/> **Real-time** | WebSocket (`ws`) |
| <img src="https://cdn.simpleicons.org/nvidia/76b900" width="14"/> **AI / LLM** | NVIDIA NIM hosted endpoint |
| <img src="https://cdn.simpleicons.org/playwright/2EAD33" width="14"/> **Web Scraping** | Playwright (headless Chromium) |
| <img src="https://cdn.simpleicons.org/leaflet/199900" width="14"/> **Maps** | Leaflet.js + OpenStreetMap |
| <img src="https://cdn.simpleicons.org/mysql/4479A1" width="14"/> **Database** | MySQL 8.0 + JSON fallback (dev) |
| <img src="https://cdn.simpleicons.org/nginx/009639" width="14"/> **Web Server** | Nginx (Alpine) |
| <img src="https://cdn.simpleicons.org/docker/2496ED" width="14"/> **Containers** | Docker + Docker Compose |
| <img src="https://cdn.simpleicons.org/pm2/2B037A" width="14"/> **Process Manager** | PM2 (`ecosystem.config.cjs`) |

---

## Project Structure

```
ProvenueAi/
├── client/
│   ├── Dockerfile              # Nginx-based frontend container
│   ├── nginx.conf              # Proxy config (/api/ -> backend)
│   └── dist/                   # Frontend pages (HTML + assets)
│       ├── index.html              # Main dashboard
│       ├── report-map.html         # Site Intelligence Report + Map
│       ├── location-analysis.html
│       ├── messages.html           # Real-time messaging
│       ├── map-view.html
│       └── room-info.html
├── server/
│   ├── Dockerfile              # Node.js 20 backend container
│   ├── src/
│   │   ├── index.js            # Express app + WebSocket server
│   │   ├── auth.js             # JWT authentication middleware
│   │   ├── store.js            # MySQL / JSON data store
│   │   ├── agents/
│   │   │   ├── report.js       # Report Generation Agent (NVIDIA NIM)
│   │   │   ├── interview.js    # Voice Interview Agent
│   │   │   ├── insight.js      # Post-Report Insight Agent
│   │   │   ├── sourcing.js     # Property Sourcing Agent
│   │   │   ├── webscout.js     # Web scraping orchestration
│   │   │   └── browserAgent.js # Playwright browser automation
│   │   ├── adapters/
│   │   │   ├── geo.js          # Geocoding (Nominatim)
│   │   │   ├── llm.js          # NVIDIA NIM LLM adapter
│   │   │   └── sheets.js       # Google Sheets data adapter
│   │   └── seed/               # Seed data scripts
│   ├── data/db.json            # JSON fallback store (dev only)
│   └── migrate.js              # Database migration script
├── docker/
│   └── mysql/init.sql          # Full MySQL schema (auto-runs on first boot)
├── docker-compose.yml          # Orchestrates db + backend + frontend
├── ecosystem.config.cjs        # PM2 process config
├── AGENTS.md                   # AI agent specifications
├── IMPLEMENTATION.md           # Full technical implementation plan
├── .env.example                # Environment variable template
└── package.json                # Root workspace config
```

---

## Getting Started

### Prerequisites

- <img src="https://cdn.simpleicons.org/docker/2496ED" width="14"/> **Docker** 24+ and **Docker Compose** v2
- <img src="https://cdn.simpleicons.org/nvidia/76b900" width="14"/> **NVIDIA NIM** API key (for AI report generation)

### Quick Start with Docker

```bash
# 1. Clone
git clone https://github.com/Swann-Htet/ProvenueAi.git
cd ProvenueAi

# 2. Configure
cp .env.example .env
# Edit .env — set your passwords, JWT secret, and NIM_API_KEY

# 3. Start all services
docker compose up -d

# App runs at http://localhost
```

### Architecture

```
Browser  :80  (Nginx / Frontend)
               |
               +-- /api/*  -->  :5178  (Node.js / Backend)
               |                         |
               +-- /ws   -->  :5178      +-- MySQL :3306 (DB)
```

### Manual Setup (without Docker)

```bash
# Install dependencies
npm install

# Set environment variables (see .env.example)
export MYSQL_HOST=localhost
export MYSQL_USER=provenue
export MYSQL_PASSWORD=your_password
export NIM_API_KEY=your_nvidia_key
export JWT_SECRET=your_secret

# Run database migrations
node server/migrate.js

# Start development server (backend + frontend watcher)
npm run dev
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MYSQL_HOST` | Yes | MySQL server hostname |
| `MYSQL_USER` | Yes | MySQL username |
| `MYSQL_PASSWORD` | Yes | MySQL password |
| `MYSQL_DATABASE` | Yes | Database name (default: `provenueai`) |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `ADMIN_EMAIL` | Yes | Initial admin account email |
| `ADMIN_PASSWORD` | Yes | Initial admin account password |
| `NIM_API_KEY` | No | NVIDIA NIM API key (required for AI features) |
| `NIM_MODEL` | No | Model name (default: `meta/llama-3.1-8b-instruct`) |
| `SERPER_API_KEY` | No | Serper.dev API key for web search |
| `LIVE_GEO` | No | Set `1` to enable live geocoding |

---

## AI Agents

ProvenueAI is built around four cooperating AI agents. See [`AGENTS.md`](AGENTS.md) for full specifications.

| Agent | Trigger | Description |
|---|---|---|
| **Property Sourcing Agent** | Admin search | Scrapes listing sites, extracts structured property data |
| **Voice Interview Agent** | User onboarding | STT to 18-field business profile via conversational Q&A |
| **Report Generation Agent** | Profile submission | NVIDIA NIM: site scoring + financial forecasting + pricing |
| **Post-Report Insight Agent** | Chat panel message | Natural-language map layer updates + what-if financials |

---

## License

<img src="https://img.shields.io/badge/License-True_Corporation_Proprietary-c8102e?style=flat-square" alt="License"/>

This repository is the **exclusive proprietary property of True Corporation PCL**.
Unauthorized use, copying, distribution, or modification by any party outside of True Corporation PCL is strictly prohibited.

See the [LICENSE](LICENSE) file for full terms.

---

<div align="center">
  <sub>
    Built by Team 6PACKS &mdash; True Alpha Internship &nbsp;|&nbsp;
    <a href="https://www.true.th">True Corporation PCL</a> &nbsp;|&nbsp;
    <a href="https://six.skillfusion.tech">six.skillfusion.tech</a>
  </sub>
</div>
