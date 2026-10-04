import 'dart:convert';

import 'package:http/http.dart' as http;

/// Kesalahan dari backend PHP. Bentuknya sama dengan respons
/// `{"error": {"code", "message"}}`; status 0 berarti server tidak terjangkau.
class ApiException implements Exception {
  ApiException(this.status, this.code, this.message);

  final int status;
  final String code;
  final String message;

  bool get isUnauthenticated => status == 401;

  @override
  String toString() => 'ApiException($status, $code): $message';
}

/// Klien HTTP untuk REST API AquaSmart.
///
/// Backend memakai cookie sesi `aquasmart_session` dan header `X-CSRF-Token`
/// pada setiap mutasi. Paket http tidak menyimpan cookie, jadi cookie sesi
/// ditangkap dari `Set-Cookie` dan dikirim ulang di sini. Sesi hanya disimpan di
/// memori: menutup aplikasi berarti login ulang, dan tidak ada token di disk.
class ApiClient {
  ApiClient({required String baseUrl, http.Client? httpClient})
    : baseUrl = normalizeBaseUrl(baseUrl),
      _http = httpClient ?? http.Client();

  static const sessionCookie = 'aquasmart_session';
  static const timeout = Duration(seconds: 15);

  final String baseUrl;
  final http.Client _http;
  String? _session;
  String? csrfToken;

  bool get hasSession => _session != null;

  static String normalizeBaseUrl(String value) {
    final trimmed = value.trim();
    return trimmed.endsWith('/') ? trimmed.substring(0, trimmed.length - 1) : trimmed;
  }

  Future<Map<String, dynamic>> get(String path) => _send('GET', path);

  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body ?? const {});

  Future<Map<String, dynamic>> patch(String path, [Map<String, dynamic>? body]) =>
      _send('PATCH', path, body ?? const {});

  Future<Map<String, dynamic>> delete(String path) => _send('DELETE', path);

  void clearSession() {
    _session = null;
    csrfToken = null;
  }

  Future<Map<String, dynamic>> _send(String method, String path, [Map<String, dynamic>? body]) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    request.headers['Accept'] = 'application/json';
    if (_session != null) request.headers['Cookie'] = '$sessionCookie=$_session';
    if (method != 'GET') {
      request.headers['Content-Type'] = 'application/json';
      if (csrfToken != null) request.headers['X-CSRF-Token'] = csrfToken!;
      if (method != 'DELETE') request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request).timeout(timeout));
    } catch (_) {
      throw ApiException(0, 'backend_unreachable', 'Server AquaSmart tidak dapat dihubungi.');
    }
    _captureSession(response.headers['set-cookie']);

    Object? decoded;
    try {
      decoded = response.body.isEmpty ? null : jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      decoded = null;
    }
    if (response.statusCode >= 200 && response.statusCode < 300 && decoded is Map<String, dynamic>) {
      return decoded;
    }
    final error = decoded is Map<String, dynamic> ? decoded['error'] : null;
    if (error is Map<String, dynamic>) {
      throw ApiException(response.statusCode, '${error['code']}', '${error['message']}');
    }
    throw ApiException(response.statusCode, 'unexpected_response', 'Jawaban server tidak dikenali.');
  }

  // Paket http menggabungkan beberapa Set-Cookie dengan koma; yang dicari hanya cookie sesi.
  void _captureSession(String? header) {
    if (header == null) return;
    final match = RegExp('(?:^|[,\\s])$sessionCookie=([^;,\\s]*)').firstMatch(header);
    if (match == null) return;
    final value = match.group(1)!;
    final expired = value.isEmpty || value == 'deleted' || RegExp(r'Max-Age=0', caseSensitive: false).hasMatch(header);
    _session = expired ? null : value;
  }
}
