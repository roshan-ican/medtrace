FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS api
COPY apps/api/ apps/api/
RUN npm run build --workspace=@medtrace/api
USER node
CMD ["node", "apps/api/dist/main.js"]

FROM dependencies AS web
COPY apps/web/ apps/web/
RUN mkdir -p apps/web/node_modules/.vite && chown node:node apps/web apps/web/node_modules/.vite
USER node
CMD ["npm", "run", "dev", "--workspace=@medtrace/web"]
