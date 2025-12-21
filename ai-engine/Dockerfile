# AI-SOC Engine Dockerfile
# Optimized for Ubuntu 24.04 LTS host

FROM python:3.11-slim-bookworm

LABEL maintainer="SOC Dashboard"
LABEL version="2.3.0"
LABEL description="AI-SOC False Positive Reduction Engine with Telegram Integration"

WORKDIR /app

# Install system dependencies
# - build-essential: required for compiling Python packages
# - curl: for healthcheck
# - libgomp1: required for scikit-learn
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Upgrade pip and install wheel for faster builds
RUN pip install --no-cache-dir --upgrade pip wheel setuptools

# Copy requirements first for Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for artifacts and database
RUN mkdir -p /app/artifacts /app/database /app/logs

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV TZ=Asia/Ho_Chi_Minh

# Expose port for FastAPI
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
