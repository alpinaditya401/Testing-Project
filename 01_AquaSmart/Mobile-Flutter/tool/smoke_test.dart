// Uji asap lapisan API terhadap backend PHP sungguhan (tanpa Flutter):
//   dart run tool/smoke_test.dart <base-url> <username> <password>
// Hanya untuk server lokal/uji: mengubah status aerator dan membuat jadwal sementara.
import 'dart:io';

import 'package:aquasmart_mobile/src/api/api_client.dart';
import 'package:aquasmart_mobile/src/api/aquasmart_api.dart';

Future<void> main(List<String> args) async {
  if (args.length != 3) {
    stderr.writeln('Pakai: dart run tool/smoke_test.dart <base-url> <username> <password>');
    exit(64);
  }
  final api = AquaSmartApi(ApiClient(baseUrl: args[0]));
  void ok(String step, Object detail) => stdout.writeln('OK   $step: $detail');

  final user = await api.login(args[1], args[2]);
  ok('login', '${user.name} (${user.role})');
  final devices = await api.devices();
  ok('devices', devices.map((d) => '${d.id}:${d.online ? 'online' : 'offline'}').join(', '));
  final device = devices.first;
  ok('readings', '${(await api.readings(device.id)).length} pembacaan ${device.id}');
  final t = await api.thresholds();
  ok('thresholds', 'pH ${t.phMin}-${t.phMax}, suhu ${t.temperatureMin}-${t.temperatureMax}');
  final alerts = await api.alerts();
  ok('alerts', '${alerts.alerts.length} alert, ${alerts.unacknowledged} belum ditangani');
  final control = await api.control(device.id, 'aerator', !device.aerator);
  ok('control', 'aerator=${control.device.aerator}, command=${control.command?.status}');
  final schedule = await api.createSchedule(device.id, '06:15', 5, 'Akhir pekan');
  ok('schedule create', '${schedule.id} ${schedule.time}');
  await api.deleteSchedule(schedule.id);
  ok('schedule delete', schedule.id);
  try {
    final rec = await api.recommendation(device.id);
    ok('recommendation', '${rec.condition} via ${rec.source}, model ${rec.modelVersion}');
    await api.feedback(rec.id, true);
    ok('feedback', rec.id);
  } on ApiException catch (error) {
    stdout.writeln('INFO recommendation: ${error.status} ${error.code}');
  }
  await api.logout();
  try {
    await api.devices();
    stdout.writeln('FAIL sesudah logout masih bisa membaca perangkat');
    exit(1);
  } on ApiException catch (error) {
    ok('logout', 'request berikutnya ${error.status} ${error.code}');
  }
}
