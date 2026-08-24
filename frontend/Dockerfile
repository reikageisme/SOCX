# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./

# puppeteer nam trong dependencies nhung khong duoc import o bat ky dau trong src/.
# Bo qua buoc tai Chromium (~180MB) giup build nhanh hon nhieu va do ton RAM.
# NODE_OPTIONS gioi han heap de npm/vite khong bi OOM tren container RAM thap.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_OPTIONS=--max-old-space-size=2048 \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000

# npm ci nhanh va tat dinh hon; roi ve npm install neu lock khong khop package.json
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Xóa trang html mặc định của nginx
RUN rm -rf /usr/share/nginx/html/*

# Copy file build từ builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Ghi đè file cấu hình Nginx để hỗ trợ client-side routing và chống cache index.html
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location = /index.html { \
        root /usr/share/nginx/html; \
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"; \
        try_files /index.html =404; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
