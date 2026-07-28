# Stage 1: Build
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Xóa trang html mặc định của nginx
RUN rm -rf /usr/share/nginx/html/*

# Copy file build từ builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Ghi đè file cấu hình Nginx để hỗ trợ client-side routing (React Router)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
