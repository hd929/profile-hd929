FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production --no-audit --no-fund
COPY . .
RUN rm -f viewed_ips.json views.json && echo '{"count":0}' > views.json && echo '{}' > viewed_ips.json
EXPOSE 3000
ENV NODE_ENV=production PORT=3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:$PORT/api/views || exit 1
CMD ["node", "server.js"]
