# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package manifests and install production deps only
COPY package.json ./
RUN npm install --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Install Chromium for Playwright (used by browserAgent)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy production deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy server source
COPY . .

EXPOSE 5178

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5178/api/health || exit 1

CMD ["node", "src/index.js"]
