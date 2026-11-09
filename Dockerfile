# Combined Railway deploy: React build + Laravel API + (external) MySQL
# Docs: docs/DEPLOY_RAILWAY.md

FROM node:20-bookworm-slim AS frontend
WORKDIR /frontend
COPY front-end/package.json front-end/package-lock.json ./
RUN npm ci --prefer-offline
COPY front-end/ ./
# Same-origin API when UI is served by Laravel
ENV REACT_APP_API_URL=/api
ENV CI=true
RUN npm run build

FROM php:8.2-cli-bookworm AS backend
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libzip-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev \
    libonig-dev libxml2-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install pdo_mysql mbstring zip bcmath gd opcache \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY backend-app/composer.json backend-app/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY backend-app/ ./
RUN composer dump-autoload --optimize --no-dev --no-interaction \
    && php artisan package:discover --ansi || true

COPY --from=frontend /frontend/build /tmp/frontend-build
RUN rm -rf public/static \
    && cp -R /tmp/frontend-build/static public/static \
    && if [ -d /tmp/frontend-build/assets ]; then rm -rf public/assets && cp -R /tmp/frontend-build/assets public/assets; fi \
    && cp -f /tmp/frontend-build/index.html public/spa.html \
    && for f in /tmp/frontend-build/*; do \
         b=$(basename "$f"); \
         if [ -f "$f" ] && [ "$b" != "index.html" ]; then cp -f "$f" "public/$b"; fi; \
       done \
    && rm -rf /tmp/frontend-build \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R ug+rwx storage bootstrap/cache

COPY scripts/railway-start.sh /usr/local/bin/railway-start.sh
RUN chmod +x /usr/local/bin/railway-start.sh

ENV APP_ENV=production
ENV LOG_CHANNEL=stderr

EXPOSE 8000
CMD ["railway-start.sh"]
