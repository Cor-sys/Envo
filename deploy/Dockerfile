# Build the React/Vite SPA, then serve it from nginx. nginx also reverse-proxies
# the Supabase service paths (/auth, /rest, /storage, /functions) so the whole
# app lives on ONE origin — no CORS, no external cloud, one URL on your LAN.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The Supabase URL + anon key are baked into the static bundle at build time.
# For a self-hosted box these point at THIS machine (set in deploy/.env).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
