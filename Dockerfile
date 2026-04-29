FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_URL=
ARG VITE_API_PREFIX=/api/v1
ARG VITE_ADMIN_EMAIL=admin@legacycards.local
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_PREFIX=${VITE_API_PREFIX}
ENV VITE_ADMIN_EMAIL=${VITE_ADMIN_EMAIL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY public/config.template.js /usr/share/nginx/html/config.template.js
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
