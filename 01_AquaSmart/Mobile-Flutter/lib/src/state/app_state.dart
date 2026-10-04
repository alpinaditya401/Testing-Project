import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import '../api/aquasmart_api.dart';
import '../api/models.dart';

/// Server bawaan: backend PHP produksi di Railway. Bisa diganti saat build dengan
/// --dart-define=AQUASMART_API_URL=... atau dari layar login.
const defaultServer = String.fromEnvironment(
  'AQUASMART_API_URL',
  defaultValue: 'https://projectbasedlearning-production.up.railway.app',
);

typedef ApiFactory = AquaSmartApi Function(String baseUrl);

class AppState extends ChangeNotifier {
  AppState({ApiFactory? apiFactory}) : _apiFactory = apiFactory ?? ((url) => AquaSmartApi(ApiClient(baseUrl: url)));

  final ApiFactory _apiFactory;
  AquaSmartApi? _api;
  User? user;
  List<Device> devices = const [];
  Thresholds? thresholds;
  String? selectedId;
  int unacknowledged = 0;

  AquaSmartApi get api => _api!;
  bool get signedIn => user != null;
  bool get isAdmin => user?.isAdmin ?? false;

  Device? get selected {
    for (final device in devices) {
      if (device.id == selectedId) return device;
    }
    return devices.isEmpty ? null : devices.first;
  }

  Future<void> login(String server, String username, String password) async {
    final api = _apiFactory(server);
    final signedIn = await api.login(username, password);
    _api = api;
    user = signedIn;
    await refresh();
  }

  Future<void> logout() async {
    try {
      await _api?.logout();
    } finally {
      _api = null;
      user = null;
      devices = const [];
      thresholds = null;
      selectedId = null;
      unacknowledged = 0;
      notifyListeners();
    }
  }

  /// Muat ulang perangkat, ambang, dan jumlah alert. Sesi habis -> kembali ke login.
  Future<void> refresh() async {
    try {
      final results = await Future.wait([api.devices(), api.thresholds(), api.alerts(limit: 1)]);
      devices = results[0] as List<Device>;
      thresholds = results[1] as Thresholds;
      unacknowledged = (results[2] as ({List<AlertItem> alerts, int unacknowledged})).unacknowledged;
      selectedId = selected?.id;
      notifyListeners();
    } on ApiException catch (error) {
      if (error.isUnauthenticated) await _expire();
      rethrow;
    }
  }

  void select(String deviceId) {
    selectedId = deviceId;
    notifyListeners();
  }

  void replaceDevice(Device device) {
    devices = [for (final d in devices) d.id == device.id ? device : d];
    notifyListeners();
  }

  void setUnacknowledged(int count) {
    unacknowledged = count;
    notifyListeners();
  }

  Future<void> _expire() async {
    _api?.client.clearSession();
    _api = null;
    user = null;
    notifyListeners();
  }

  /// Jalankan aksi API; sesi yang habis di tengah jalan mengembalikan pengguna ke login.
  Future<T> guard<T>(Future<T> Function(AquaSmartApi api) action) async {
    try {
      return await action(api);
    } on ApiException catch (error) {
      if (error.isUnauthenticated) await _expire();
      rethrow;
    }
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;

  static AppState read(BuildContext context) => context.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
