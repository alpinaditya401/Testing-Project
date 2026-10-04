import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Backend tiruan dengan bentuk respons dari fixtures PHP asli.
class FakeBackend {
  FakeBackend({this.role = 'admin', this.aiConfigured = true});

  final String role;
  final bool aiConfigured;
  final List<http.Request> requests = [];
  bool aerator = true;

  static const session = 'sess123';
  static const csrf = 'csrf-token-abc';

  Map<String, dynamic> _device(String id, String name, double ph) => {
    'id': id,
    'name': name,
    'location': 'Area Budidaya Utama',
    'online': true,
    'aerator': id == 'AQS-KOLAM-01' ? aerator : false,
    'feeder': false,
    'auto': true,
    'last_seen': DateTime.now().toUtc().toIso8601String(),
    'latest_reading': {
      'ph': ph,
      'temperature': 28.4,
      'turbidity': 42,
      'simulation': true,
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'provenance': 'seed',
      'source_session': 'seed-local-v1',
    },
  };

  late final MockClient client = MockClient((request) async {
    requests.add(request);
    final path = request.url.path;
    final authed = request.headers['Cookie'] == 'aquasmart_session=$session';
    http.Response json(Object body, [int status = 200, Map<String, String> headers = const {}]) =>
        http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json', ...headers});
    http.Response error(int status, String code, String message) => json({
      'error': {'code': code, 'message': message},
    }, status);

    if (path == '/api/auth/login') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      if (body['password'] != 'benar') return error(401, 'invalid_credentials', 'Kredensial tidak valid.');
      return json(
        {
          'user': {'id': 1, 'username': 'admin', 'name': 'Admin AquaSmart', 'role': role},
          'csrf_token': csrf,
        },
        200,
        {'set-cookie': 'aquasmart_session=$session; path=/; HttpOnly; SameSite=Lax'},
      );
    }
    if (!authed) return error(401, 'unauthenticated', 'Silakan login terlebih dahulu.');
    if (request.method != 'GET' && request.headers['X-CSRF-Token'] != csrf) {
      return error(403, 'csrf_mismatch', 'Token CSRF tidak valid.');
    }
    switch ((request.method, path)) {
      case ('GET', '/api/devices'):
        return json({
          'devices': [_device('AQS-KOLAM-01', 'Kolam Lele 1', 7.1), _device('AQS-AQUA-02', 'Bak Aquaponik 2', 9.2)],
        });
      case ('GET', '/api/settings/thresholds'):
        return json({
          'thresholds': {
            'ph_min': 6.5,
            'ph_max': 8.5,
            'temperature_min': 25,
            'temperature_max': 30,
            'turbidity_max': 50,
          },
        });
      case ('GET', '/api/alerts'):
        return json({'alerts': [], 'unacknowledged_count': 2});
      case ('GET', final p) when p.endsWith('/recommendation'):
        if (!aiConfigured) return error(503, 'ai_unavailable', 'Layanan AI belum dikonfigurasi di server.');
        return json({
          'recommendation': {
            'id': '0b5d6c4e-1f2a-4b3c-8d9e-0a1b2c3d4e5f',
            'condition': 'waspada',
            'source': 'model',
            'confidence': 0.81,
            'reasons': ['Model memperkirakan suhu keluar ambang.'],
            'actions': ['Pantau 15 menit ke depan.'],
            'model': {'version': 'rf-20261004111819-72b3b8'},
            'actuation': false,
          },
          'input': {'readings': 18, 'simulation_readings': 18},
        });
      case ('POST', final p) when p.endsWith('/control'):
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        aerator = body['value'] as bool;
        return json({
          'device': _device('AQS-KOLAM-01', 'Kolam Lele 1', 7.1),
          'command': {'id': 'abc', 'actuator': body['actuator'], 'value': body['value'], 'status': 'pending'},
        });
      case ('POST', '/api/auth/logout'):
        return json(
          {'logged_out': true},
          200,
          {'set-cookie': 'aquasmart_session=deleted; expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0'},
        );
    }
    return error(404, 'not_found', 'Tidak ada.');
  });
}
