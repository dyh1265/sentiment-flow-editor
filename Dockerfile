# syntax=docker/dockerfile:1.7

# Stage 1: build the static export with Next.js
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps with a clean lockfile-based install if present, fallback to npm install.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# Stage 2: serve the exported `out/` folder with nginx. No Node runtime, no
# secrets inside the image — the app is pure browser code plus static assets.
FROM nginx:1.27-alpine AS runner

# Minimal nginx config: single-page-app fallback, cache static chunks.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
