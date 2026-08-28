# Stage 1: Build dependencies
FROM python:3.12-slim AS builder

WORKDIR /app
# gcc/python3-dev only needed for building wheels (e.g. cryptography, greenlet)
RUN apt-get update && apt-get install -y --no-install-recommends gcc python3-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# Stage 2: Runtime - minimal, no nmap/tshark
FROM python:3.12-slim

# No extra apt packages needed (removed nmap/tshark to speed up build & reduce image ~200MB)
# Create non-root user
RUN groupadd -r socuser && useradd -r -g socuser socuser

WORKDIR /app

# Install dependencies from builder
COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache /wheels/*

# Copy app code
COPY . .

# Set permissions and create data directory
RUN mkdir -p /app/data && chown -R socuser:socuser /app
USER socuser

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
