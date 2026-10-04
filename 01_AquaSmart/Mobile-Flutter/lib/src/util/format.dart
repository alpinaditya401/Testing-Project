import '../api/models.dart';

/// Angka gaya Indonesia: koma sebagai pemisah desimal.
String decimal(double? value, [int digits = 1]) =>
    value == null ? '—' : value.toStringAsFixed(digits).replaceAll('.', ',');

String ago(DateTime? time, {DateTime? now}) {
  if (time == null) return 'belum pernah';
  final diff = (now ?? DateTime.now().toUtc()).difference(time);
  if (diff.inSeconds < 60) return 'baru saja';
  if (diff.inMinutes < 60) return '${diff.inMinutes} menit lalu';
  if (diff.inHours < 24) return '${diff.inHours} jam lalu';
  return '${diff.inDays} hari lalu';
}

enum Level { normal, outOfRange, unknown }

/// Status satu parameter terhadap ambang workspace (FR-04/FR-08).
Level levelOf(String parameter, double? value, Thresholds t) {
  if (value == null) return Level.unknown;
  final inRange = switch (parameter) {
    'ph' => value >= t.phMin && value <= t.phMax,
    'temperature' => value >= t.temperatureMin && value <= t.temperatureMax,
    'turbidity' => value >= 0 && value <= t.turbidityMax,
    _ => true,
  };
  return inRange ? Level.normal : Level.outOfRange;
}

/// Data dianggap lama bila pembacaan terakhir lebih dari 10 menit lalu.
bool isStale(DateTime? time, {DateTime? now}) =>
    time == null || (now ?? DateTime.now().toUtc()).difference(time) > const Duration(minutes: 10);

/// Label asal data. Data simulasi dan contoh tidak boleh terbaca sebagai sensor fisik.
String provenanceLabel(Reading reading) => switch (reading.provenance) {
  'device' when !reading.simulation => 'Perangkat',
  'seed' => 'Data contoh',
  'manual' => 'Manual',
  'legacy_unverified' => 'Belum terverifikasi',
  _ => 'Simulasi',
};
