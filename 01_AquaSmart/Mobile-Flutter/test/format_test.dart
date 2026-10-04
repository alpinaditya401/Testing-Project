import 'package:aquasmart_mobile/src/api/models.dart';
import 'package:aquasmart_mobile/src/util/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final t = Thresholds(phMin: 6.5, phMax: 8.5, temperatureMin: 25, temperatureMax: 30, turbidityMax: 50);

  test('status parameter terhadap ambang, termasuk tepat di batas', () {
    expect(levelOf('ph', 6.5, t), Level.normal);
    expect(levelOf('ph', 8.51, t), Level.outOfRange);
    expect(levelOf('temperature', 31, t), Level.outOfRange);
    expect(levelOf('turbidity', 50, t), Level.normal);
    expect(levelOf('turbidity', null, t), Level.unknown);
  });

  test('angka memakai koma desimal', () {
    expect(decimal(27.25, 1), '27,3');
    expect(decimal(null), '—');
  });

  test('data lama setelah 10 menit', () {
    final now = DateTime.utc(2026, 10, 4, 12);
    expect(isStale(now.subtract(const Duration(minutes: 9)), now: now), isFalse);
    expect(isStale(now.subtract(const Duration(minutes: 11)), now: now), isTrue);
    expect(isStale(null, now: now), isTrue);
    expect(ago(now.subtract(const Duration(minutes: 5)), now: now), '5 menit lalu');
  });

  test('data contoh dan simulasi tidak terbaca sebagai perangkat', () {
    Reading r(String p, bool sim) =>
        Reading(time: null, ph: 7, temperature: 28, turbidity: 10, simulation: sim, provenance: p);
    expect(provenanceLabel(r('seed', true)), 'Data contoh');
    expect(provenanceLabel(r('simulation', true)), 'Simulasi');
    expect(provenanceLabel(r('device', false)), 'Perangkat');
    expect(provenanceLabel(r('device', true)), 'Simulasi');
  });
}
