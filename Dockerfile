# Stage 1: Build stage
FROM python:3.11-slim AS builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt /app/

# Build and install dependencies locally to user directory
RUN pip install --no-cache-dir --user -r requirements.txt


# Stage 2: Final runner stage
FROM python:3.11-slim AS runner

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV PATH=/root/.local/bin:$PATH

WORKDIR /app

# Copy built python dependencies from builder stage
COPY --from=builder /root/.local /root/.local

# Copy backend codebase and ml baseline datasets
COPY backend /app/backend
COPY ml /app/ml

# Expose FastAPI port
EXPOSE 8000

# Start FastAPI server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
