import 'dart:math';

import 'api_client.dart';
import 'models.dart';

/// Endpoint REST AquaSmart yang dipakai aplikasi mobile (server/API.md).
class AquaSmartApi {
  AquaSmartApi(this.client);

  final ApiClient client;

  String _id(String value) => Uri.encodeComponent(value);

  Future<User> login(String username, String password) async {
    final json = await client.post('/api/auth/login', {'username': username, 'password': password});
    client.csrfToken = json['csrf_token'] as String?;
    return User.fromJson(json['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    try {
      await client.post('/api/auth/logout');
    } on ApiException catch (error) {
      // Sesi yang sudah habis di server berarti tujuan keluar sudah tercapai.
      if (!error.isUnauthenticated) rethrow;
    } finally {
      client.clearSession();
    }
  }

  Future<List<Device>> devices() async {
    final json = await client.get('/api/devices');
    return [for (final item in json['devices'] as List) Device.fromJson(item as Map<String, dynamic>)];
  }

  Future<List<Reading>> readings(String deviceId, {int limit = 36}) async {
    final json = await client.get('/api/devices/${_id(deviceId)}/readings?limit=$limit');
    return [for (final item in json['readings'] as List) Reading.fromJson(item as Map<String, dynamic>)];
  }

  Future<Thresholds> thresholds() async {
    final json = await client.get('/api/settings/thresholds');
    return Thresholds.fromJson(json['thresholds'] as Map<String, dynamic>);
  }

  Future<({List<AlertItem> alerts, int unacknowledged})> alerts({int limit = 50}) async {
    final json = await client.get('/api/alerts?limit=$limit');
    return (
      alerts: [for (final item in json['alerts'] as List) AlertItem.fromJson(item as Map<String, dynamic>)],
      unacknowledged: (json['unacknowledged_count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<AlertItem> acknowledge(int alertId) async {
    final json = await client.patch('/api/alerts/$alertId/acknowledge');
    return AlertItem.fromJson(json['alert'] as Map<String, dynamic>);
  }

  /// Kontrol aktuator. Di backend jalur ini masih SIMULASI: perintah tercatat dan
  /// berpindah status, tetapi aktuasi fisik belum terbukti.
  Future<({Device device, Command? command})> control(
    String deviceId,
    String actuator,
    bool value, {
    int duration = 8,
  }) async {
    final body = <String, dynamic>{'actuator': actuator, 'value': value, 'request_id': requestId()};
    if (actuator == 'feeder') body['duration'] = duration;
    final json = await client.post('/api/devices/${_id(deviceId)}/control', body);
    final command = json['command'];
    return (
      device: Device.fromJson(json['device'] as Map<String, dynamic>),
      command: command is Map<String, dynamic> ? Command.fromJson(command) : null,
    );
  }

  Future<List<Schedule>> schedules(String deviceId) async {
    final json = await client.get('/api/devices/${_id(deviceId)}/schedules');
    return [for (final item in json['schedules'] as List) Schedule.fromJson(item as Map<String, dynamic>)];
  }

  Future<Schedule> createSchedule(String deviceId, String time, int duration, String days) async {
    final json = await client.post('/api/devices/${_id(deviceId)}/schedules', {
      'time': time,
      'duration': duration,
      'days': days,
    });
    return Schedule.fromJson(json['schedule'] as Map<String, dynamic>);
  }

  Future<void> deleteSchedule(int scheduleId) => client.delete('/api/schedules/$scheduleId');

  Future<Recommendation> recommendation(String deviceId) async =>
      Recommendation.fromJson(await client.get('/api/devices/${_id(deviceId)}/recommendation'));

  Future<void> feedback(String recommendationId, bool helpful) =>
      client.post('/api/recommendations/${_id(recommendationId)}/feedback', {'helpful': helpful});
}

final _random = Random.secure();

/// request_id membuat perintah idempoten di server: 1-120 karakter alnum/:_.-.
String requestId() => [for (var i = 0; i < 16; i++) _random.nextInt(256).toRadixString(16).padLeft(2, '0')].join();
