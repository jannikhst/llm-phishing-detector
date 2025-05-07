# Node.js base image
FROM node:21-alpine

# Arbeitsverzeichnis setzen
WORKDIR /app

# Abhängigkeiten für ClamAV und Node installieren
RUN apk update && \
    apk add --no-cache \
        clamav \
        clamav-libunrar \
        clamav-daemon \
        chromium \
        udev \
        ttf-freefont && \
    npm install -g typescript

# ClamAV-Konfiguration: "Example" auskommentieren und Socket-Pfad anpassen
RUN sed -i 's/^Example/#Example/' /etc/clamav/clamd.conf \
 && sed -i 's|^#LocalSocket .*|LocalSocket /run/clamav/clamd.sock|' /etc/clamav/clamd.conf \
 && sed -i 's|^#LocalSocketMode .*|LocalSocketMode 666|' /etc/clamav/clamd.conf \
 && sed -i 's|^#FixStaleSocket .*|FixStaleSocket true|' /etc/clamav/clamd.conf

# Socket-Verzeichnis anlegen und Berechtigungen setzen
RUN mkdir -p /run/clamav \
    && chown -R clamav:clamav /run/clamav

# Virendatenbank aktualisieren
RUN freshclam

# Umgebungsvariablen für Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Package.json kopieren und NPM-Abhängigkeiten installieren
COPY package.json ./
RUN npm install

# Quellcode kopieren
COPY src ./src
COPY tsconfig.json ./

# Build
RUN npm run build

# Port öffnen
EXPOSE 3000

# clamd und Node-App starten
CMD ["sh", "-c", "clamd && npm run production"]