import 'dart:convert';
import 'dart:io';

import 'package:aquasmart_mobile/src/api/api_client.dart';
import 'package:aquasmart_mobile/src/api/aquasmart_api.dart';
import 'package:aquasmart_mobile/src/api/models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fake_backend.dart';

void main() {
  test('cookie sesi dan token CSRF dikirim ulang setelah login', () async {
    final backend = FakeBackend();
    final api = AquaSmartApi(ApiClient(baseUrl: 'https://contoh.test/', httpClient: backend.client));
    final user = await api.login('admin', 'benar');
    expect(user.isAdmin, isTrue);
    await api.control('AQS-KOLAM-01', 'aerator', false);
    final control = backend.requests.last;
    expect(control.url.toString(), 'https://contoh.test/api/devices/AQS-KOLAM-01/control');
    expect(control.headers['Cookie'], 'aquasmart_session=${FakeBackend.session}');
    expect(control.headers['X-CSRF-Token'], FakeBackend.csrf);
    final body = jsonDecode(control.body) as Map<String, dynamic>;
    expect(body['request_id'], matches(RegExp(r'^[0-9a-f]{32}$')));
    expect(body.containsKey('duration'), isFalse);
  });

  test('logout menghapus sesi lokal', () async {
    final backend = FakeBackend();
    final client = ApiClient(baseUrl: 'https://contoh.test', httpClient: backend.client);
    final api = AquaSmartApi(client);
    await api.login('admin', 'benar');
    await api.logout();
    expect(client.hasSession, isFalse);
    expect(() => api.devices(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
  });

  test('error backend dipetakan ke ApiException berbahasa Indonesia', () async {
    final api = AquaSmartApi(ApiClient(baseUrl: 'https://contoh.test', httpClient: FakeBackend().client));
    await expectLater(
      api.login('admin', 'salah'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.status, 'status', 401)
            .having((e) => e.code, 'code', 'invalid_credentials')
            .having((e) => e.message, 'message', 'Kredensial tidak valid.'),
      ),
    );
  });

  test('server tidak terjangkau menjadi status 0', () async {
    final offline = MockClient((_) async => throw const SocketException('down'));
    final api = AquaSmartApi(ApiClient(baseUrl: 'https://contoh.test', httpClient: offline));
    await expectLater(api.devices(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 0)));
  });

  test('respons bukan JSON tidak dianggap sukses', () async {
    final html = MockClient((_) async => http.Response('<html>502</html>', 502));
    final api = AquaSmartApi(ApiClient(baseUrl: 'https://contoh.test', httpClient: html));
    await expectLater(api.devices(), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'unexpected_response')));
  });

  group('model membaca respons PHP asli (frontend/lib/api/fixtures.json)', () {
    final file = File('../../frontend/lib/api/fixtures.json');
    final fixtures = file.existsSync() ? jsonDecode(file.readAsStringSync()) as List : const [];
    Map<String, dynamic> body(String method, String path) =>
        (fixtures.firstWhere((f) => f['method'] == method && f['path'] == path && f['status'] < 300) as Map)['body']
            as Map<String, dynamic>;

    test('perangkat, pembacaan, ambang, alert, jadwal, kontrol', () {
      final devices = [for (final d in body('GET', '/api/devices')['devices'] as List) Device.fromJson(d)];
      expect(devices, isNotEmpty);
      expect(devices.any((d) => d.latest == null), isTrue, reason: 'perangkat tanpa pembacaan harus terbaca');
      final reading = Reading.fromJson(
        (body('GET', '/api/devices/AQS-WARNING/readings?limit=5')['readings'] as List).first,
      );
      expect(reading.time, isNotNull);
      expect(reading.simulation, isTrue);
      final t = Thresholds.fromJson(body('GET', '/api/settings/thresholds')['thresholds']);
      expect(t.temperatureMax, 30);
      final alert = AlertItem.fromJson((body('GET', '/api/alerts?limit=20')['alerts'] as List).first);
      expect(alert.severity, 'critical');
      final schedule = Schedule.fromJson(
        (body('GET', '/api/devices/AQS-KOLAM-01/schedules')['schedules'] as List).first,
      );
      expect(Schedule.dayOptions, contains(schedule.days));
      final control = body('POST', '/api/devices/AQS-WARNING/control');
      expect(Command.fromJson(control['command']).status, isNotEmpty);
      expect(User.fromJson(body('POST', '/api/auth/login')['user']).role, isNotEmpty);
    }, skip: fixtures.isEmpty ? 'fixtures.json tidak ada di luar repositori lengkap' : false);
  });
}
