"""Layanan AI AquaSmart: rekomendasi, model registry, retraining (SKPL FR-16 sampai FR-20)."""
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from . import db
from .api import ApiError, api
from .config import Config
from .registry import RegistryError


def create_app(config=None):
    config = config or Config.from_env()
    config.data_dir.mkdir(parents=True, exist_ok=True)
    db.migrate(config.data_dir / 'registry.sqlite')
    app = Flask(__name__)
    app.config['AQUASMART'] = config
    app.config['MAX_CONTENT_LENGTH'] = 256 * 1024
    app.json.ensure_ascii = False
    app.register_blueprint(api)

    @app.errorhandler(ApiError)
    @app.errorhandler(RegistryError)
    def handled(exc):
        return jsonify({'error': {'code': exc.code, 'message': exc.message}}), exc.status

    @app.errorhandler(HTTPException)
    def http_error(exc):
        codes = {404: 'not_found', 405: 'method_not_allowed', 413: 'payload_too_large'}
        return jsonify({'error': {'code': codes.get(exc.code, 'http_error'), 'message': exc.description}}), exc.code

    @app.errorhandler(Exception)
    def unexpected(exc):
        app.logger.exception('Kesalahan tak terduga')
        return jsonify({'error': {'code': 'internal_error', 'message': 'Gangguan layanan AI.'}}), 500

    @app.after_request
    def headers(response):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    return app
