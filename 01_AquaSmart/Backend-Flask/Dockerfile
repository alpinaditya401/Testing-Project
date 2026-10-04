# Layanan AI AquaSmart (Flask + gunicorn).
#
# Build dari folder ini:  docker build -t aquasmart-ai .
# Jalankan:               docker run -p 8000:8000 -v aquasmart-ai:/data \
#                           -e AQUASMART_AI_SERVICE_KEY=... -e AQUASMART_AI_ADMIN_KEY=... \
#                           -e AQUASMART_AI_BOOTSTRAP=1 aquasmart-ai
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AQUASMART_AI_DATA_DIR=/data/ai

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin aquasmart

COPY aquasmart_ai ./aquasmart_ai
COPY datasets ./datasets
COPY wsgi.py start.sh ./
RUN chmod +x start.sh

EXPOSE 8000
# start-period panjang: bootstrap melatih model awal sebelum gunicorn mulai.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'),timeout=4)"

CMD ["./start.sh"]
