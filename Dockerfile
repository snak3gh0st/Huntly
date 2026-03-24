## Stage 1: Build dashboard
FROM node:22-slim AS dashboard-build

WORKDIR /dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ .
RUN npm run build

## Stage 2: Build and run backend
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Copy non-TS assets that tsc doesn't handle
RUN cp -r src/templates dist/templates

# Copy dashboard build into dist/dashboard (served by Fastify)
COPY --from=dashboard-build /dashboard/dist dist/dashboard

EXPOSE 3002

CMD ["node", "dist/index.js"]
