import 'package:aquasmart_mobile/main.dart';
import 'package:aquasmart_mobile/src/api/api_client.dart';
import 'package:aquasmart_mobile/src/api/aquasmart_api.dart';
import 'package:aquasmart_mobile/src/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_backend.dart';

Future<FakeBackend> pumpApp(WidgetTester tester, {String role = 'admin', bool ai = true}) async {
  final backend = FakeBackend(role: role, aiConfigured: ai);
  final state = AppState(
    apiFactory: (url) => AquaSmartApi(ApiClient(baseUrl: url, httpClient: backend.client)),
  );
  await tester.pumpWidget(AquaSmartApp(state: state));
  return backend;
}

Future<void> login(WidgetTester tester, String password) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'Email, nomor WA, atau username'), 'admin');
  await tester.enterText(find.widgetWithText(TextFormField, 'Kata sandi'), password);
  await tester.tap(find.text('Masuk'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('login salah menampilkan pesan server', (tester) async {
    await pumpApp(tester);
    await login(tester, 'salah');
    expect(find.text('Kredensial tidak valid.'), findsOneWidget);
  });

  testWidgets('dashboard menampilkan sensor, status, asal data, dan rekomendasi', (tester) async {
    await pumpApp(tester);
    await login(tester, 'benar');
    expect(find.text('Kolam Lele 1'), findsWidgets);
    expect(find.text('7,1'), findsOneWidget);
    expect(find.text('28,4 °C'), findsOneWidget);
    expect(find.text('42 NTU'), findsOneWidget);
    expect(find.text('Data contoh'), findsOneWidget);
    expect(find.text('Waspada'), findsOneWidget);
    expect(find.textContaining('rf-20261004111819-72b3b8'), findsOneWidget);
    expect(find.textContaining('18 pembacaan masukan berasal dari simulasi'), findsOneWidget);
    // Badge jumlah alert yang belum ditangani.
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('ganti perangkat memperbarui nilai dan status', (tester) async {
    await pumpApp(tester);
    await login(tester, 'benar');
    await tester.tap(find.byKey(const Key('device-picker')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bak Aquaponik 2 · AQS-AQUA-02').last);
    await tester.pumpAndSettle();
    expect(find.text('9,2'), findsOneWidget);
    expect(find.text('Di luar ambang'), findsWidgets);
  });

  testWidgets('layanan AI belum aktif dijelaskan, bukan error mentah', (tester) async {
    await pumpApp(tester, ai: false);
    await login(tester, 'benar');
    expect(find.textContaining('Layanan AI belum diaktifkan di server'), findsOneWidget);
  });

  testWidgets('kontrol aerator meminta konfirmasi dan memakai CSRF', (tester) async {
    final backend = await pumpApp(tester);
    await login(tester, 'benar');
    await tester.tap(find.text('Kontrol'));
    await tester.pumpAndSettle();
    expect(find.textContaining('SIMULASI'), findsOneWidget);
    await tester.tap(find.byKey(const Key('aerator-switch')));
    await tester.pumpAndSettle();
    expect(find.text('Matikan aerator?'), findsOneWidget);
    await tester.tap(find.text('Kirim perintah'));
    await tester.pumpAndSettle();
    final control = backend.requests.lastWhere((r) => r.url.path.endsWith('/control'));
    expect(control.headers['X-CSRF-Token'], FakeBackend.csrf);
    expect(find.textContaining('Belum ada bukti aktuasi fisik'), findsOneWidget);
  });

  testWidgets('viewer tidak dapat mengirim perintah', (tester) async {
    await pumpApp(tester, role: 'viewer');
    await login(tester, 'benar');
    await tester.tap(find.text('Kontrol'));
    await tester.pumpAndSettle();
    expect(find.text('Akun viewer hanya memiliki akses baca.'), findsOneWidget);
    final feed = tester.widget<FilledButton>(
      find.ancestor(of: find.text('Beri pakan'), matching: find.byType(FilledButton)),
    );
    expect(feed.onPressed, isNull);
  });

  testWidgets('logout kembali ke layar login', (tester) async {
    await pumpApp(tester);
    await login(tester, 'benar');
    await tester.tap(find.byTooltip('Keluar'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Keluar'));
    await tester.pumpAndSettle();
    expect(find.text('Masuk'), findsOneWidget);
  });
}
