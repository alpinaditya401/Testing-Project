"""Titik masuk produksi: gunicorn --bind 0.0.0.0:8000 --timeout 180 wsgi:app"""
from aquasmart_ai import create_app

app = create_app()
