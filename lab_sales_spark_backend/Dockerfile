FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose port (Cloud Run uses PORT env var, defaults to 8080)
EXPOSE 8080

CMD ["python", "server.py"]
