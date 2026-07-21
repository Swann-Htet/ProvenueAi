<div align="center">
  <img src="client/dist/logo.png" alt="ProvenueAI Logo" width="180"/>
  <h1>ProvenueAI</h1>
  <p><strong>AI-powered site intelligence & financial simulation for Thai SME restaurants</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js" alt="Node.js"/>
    <img src="https://img.shields.io/badge/Express-4.x-lightgrey?logo=express" alt="Express"/>
    <img src="https://img.shields.io/badge/NVIDIA_NIM-LLM-76b900?logo=nvidia" alt="NVIDIA NIM"/>
    <img src="https://img.shields.io/badge/License-MIT-blue" alt="License"/>
  </p>
</div>

---

## Overview

**ProvenueAI** is a two-sided platform that connects Thai SME restaurant owners with AI-driven location intelligence and financial feasibility analysis. Admins source and publish available property listings, while restaurant owners describe their business through a natural form or voice interview to receive a fully AI-generated **Site Intelligence Report**.

```
Admin → Property Sourcing Agent → Curated Listings DB
User  → 18-field Business Profile → NVIDIA NIM Report Engine
                                  → Site Score + Financial Forecast + Pricing
                                  → Post-Report Q&A Agent (Live Map Updates)
```

---

## Key Features

| Feature | Description |
|---|---|
| **Property Sourcing Agent** | Admin types an area; AI scrapes & structures candidate listings from public sources |
| **Voice Interview Agent** | Conversational STT-driven onboarding fills all 18 business profile fields |
| **Report Generation (NVIDIA NIM)** | Site scoring across 6 dimensions, financial forecast (3 scenarios), menu pricing matrix |
| **Post-Report Insight Agent** | Natural-language map Q&A — ask a question, watch the map update live |
| **JWT Auth** | Separate Admin and User roles with secure session management |
| **Real-time Messaging** | WebSocket-powered chat between admin and users |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML + CSS + JavaScript (multi-page) |
| **Backend** | Node.js + Express (ESM) |
| **Auth** | JWT + bcryptjs |
| **Real-time** | WebSocket (`ws`) |
| **AI / LLM** | NVIDIA NIM hosted endpoint |
| **Web Scraping** | Playwright (headless) |
| **Maps** | Leaflet.js + OpenStreetMap |
| **Data** | MySQL2, Google Sheets API |
| **Process Manager** | PM2 (`ecosystem.config.cjs`) |

---

## Project Structure

```
ProvenueAi/
├── client/
│   └── dist/               # Frontend pages (HTML + assets)
│       ├── index.html          # Main dashboard
│       ├── report-map.html     # Site Intelligence Report + Map
│       ├── location-analysis.html
│       ├── messages.html       # Real-time messaging
│       ├── map-view.html
│       └── room-info.html
├── server/
│   ├── src/
│   │   ├── index.js            # Express app + WebSocket server
│   │   ├── auth.js             # JWT authentication middleware
│   │   ├── store.js            # Data store / DB layer
│   │   ├── agents/
│   │   │   ├── report.js       # Report Generation Agent (NVIDIA NIM)
│   │   │   ├── interview.js    # Voice Interview Agent
│   │   │   ├── insight.js      # Post-Report Insight Agent
│   │   │   ├── sourcing.js     # Property Sourcing Agent
│   │   │   ├── summary.js      # Summary Agent
│   │   │   ├── webscout.js     # Web scraping orchestration
│   │   │   └── browserAgent.js # Playwright browser automation
│   │   ├── adapters/
│   │   │   ├── geo.js          # Geocoding (Nominatim)
│   │   │   ├── llm.js          # NVIDIA NIM LLM adapter
│   │   │   └── sheets.js       # Google Sheets data adapter
│   │   └── seed/
│   │       ├── listings.js     # Seed property listings
│   │       └── zones.js        # Seed zone/foot-traffic data
│   ├── data/
│   │   └── db.json             # Seed data
│   ├── migrate.js              # Database migration script
│   └── package.json
├── AGENTS.md                   # AI agent specifications
├── IMPLEMENTATION.md           # Full technical implementation plan
├── ecosystem.config.cjs        # PM2 process config
└── package.json                # Root workspace config
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm** 9+
- **MySQL** (or compatible) database
- **NVIDIA NIM** API key (for LLM-powered report generation)
- **Google Service Account** credentials (for Sheets data adapter)

### Installation

```bash
# Clone the repository
git clone https://github.com/Swann-Htet/ProvenueAi.git
cd ProvenueAi

# Install all workspace dependencies
npm install
```

### Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Server
PORT=3000
JWT_SECRET=your_jwt_secret_here

# MySQL Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_db_password
DB_NAME=provenueai

# NVIDIA NIM
NVIDIA_API_KEY=your_nvidia_nim_api_key
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1

# Google Sheets (base64-encoded service account JSON)
GOOGLE_CREDENTIALS_BASE64=your_base64_encoded_credentials
GOOGLE_SHEET_ID=your_sheet_id
```

### Database Setup

```bash
# Run migrations to set up the schema
node server/migrate.js

# (Optional) Seed with demo data
node server/src/seed-demo-script.js
```

### Running the Application

```bash
# Development mode (server + client with live reload)
npm run dev

# Production (via PM2)
npm start
```

The server starts at `http://localhost:3000`.

---

## AI Agents

ProvenueAI is built around four cooperating AI agents. See [`AGENTS.md`](AGENTS.md) for full specifications.

| Agent | Trigger | Description |
|---|---|---|
| **Property Sourcing Agent** | Admin search | Scrapes listing sites, extracts structured property data |
| **Voice Interview Agent** | User onboarding | STT → 18-field business profile via conversational Q&A |
| **Report Generation Agent** | Profile submission | NVIDIA NIM: site scoring + financial forecasting + pricing |
| **Post-Report Insight Agent** | Chat panel message | Natural-language map layer updates + what-if financials |

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with ❤️ by Team 6PACKS · True Alpha Internship</sub>
</div>
