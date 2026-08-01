FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PIPELINE_PYTHON=python3 \
    PIPELINE_FFMPEG=/usr/bin/ffmpeg \
    PIPELINE_FFPROBE=/usr/bin/ffprobe

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       fonts-noto-cjk \
       libreoffice-impress \
       poppler-utils \
       python3 \
       python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package.json ./backend/package.json
WORKDIR /app/backend
RUN npm install --omit=dev --ignore-scripts

WORKDIR /app
COPY backend ./backend
RUN python3 -m pip install \
      --break-system-packages \
      --no-cache-dir \
      -r backend/requirements.txt

ENTRYPOINT ["node", "backend/run.mjs"]
