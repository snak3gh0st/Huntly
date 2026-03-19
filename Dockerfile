FROM node:22-slim

# Playwright/Chromium dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright Chromium
RUN npx playwright install chromium

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Copy non-TS assets that tsc doesn't handle
RUN cp -r src/templates dist/templates

EXPOSE 3002

CMD ["node", "dist/index.js"]
