// Model data dari respons backend PHP (server/API.md). Angka dari PHP bisa
// datang sebagai int atau double, jadi semuanya dibaca lewat `num`.

double? _double(Object? value) => value is num ? value.toDouble() : null;

DateTime? _time(Object? value) => value is String ? DateTime.tryParse(value)?.toUtc() : null;

class User {
  User({required this.id, required this.name, required this.username, required this.role});

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as int,
    name: json['name'] as String? ?? '',
    username: json['username'] as String? ?? '',
    role: json['role'] as String? ?? 'viewer',
  );

  final int id;
  final String name;
  final String username;
  final String role;

  bool get isAdmin => role == 'admin';
}

class Reading {
  Reading({
    required this.time,
    required this.ph,
    required this.temperature,
    required this.turbidity,
    required this.simulation,
    required this.provenance,
  });

  factory Reading.fromJson(Map<String, dynamic> json) => Reading(
    time: _time(json['time'] ?? json['created_at']),
    ph: _double(json['ph']),
    temperature: _double(json['temperature']),
    turbidity: _double(json['turbidity']),
    simulation: json['simulation'] == true,
    provenance: json['provenance'] as String? ?? 'legacy_unverified',
  );

  final DateTime? time;
  final double? ph;
  final double? temperature;
  final double? turbidity;
  final bool simulation;
  final String provenance;
}

class Device {
  Device({
    required this.id,
    required this.name,
    required this.location,
    required this.online,
    required this.aerator,
    required this.feeder,
    required this.auto,
    required this.lastSeen,
    required this.latest,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    final latest = json['latest_reading'];
    return Device(
      id: json['id'] as String,
      name: json['name'] as String? ?? json['id'] as String,
      location: json['location'] as String? ?? '',
      online: json['online'] == true,
      aerator: json['aerator'] == true,
      feeder: json['feeder'] == true,
      auto: json['auto'] == true,
      lastSeen: _time(json['last_seen']),
      latest: latest is Map<String, dynamic> ? Reading.fromJson(latest) : null,
    );
  }

  final String id;
  final String name;
  final String location;
  final bool online;
  final bool aerator;
  final bool feeder;
  final bool auto;
  final DateTime? lastSeen;
  final Reading? latest;
}

class Thresholds {
  Thresholds({
    required this.phMin,
    required this.phMax,
    required this.temperatureMin,
    required this.temperatureMax,
    required this.turbidityMax,
  });

  factory Thresholds.fromJson(Map<String, dynamic> json) => Thresholds(
    phMin: _double(json['ph_min'])!,
    phMax: _double(json['ph_max'])!,
    temperatureMin: _double(json['temperature_min'])!,
    temperatureMax: _double(json['temperature_max'])!,
    turbidityMax: _double(json['turbidity_max'])!,
  );

  final double phMin;
  final double phMax;
  final double temperatureMin;
  final double temperatureMax;
  final double turbidityMax;
}

class AlertItem {
  AlertItem({
    required this.id,
    required this.deviceId,
    required this.severity,
    required this.message,
    required this.source,
    required this.acknowledged,
    required this.createdAt,
  });

  factory AlertItem.fromJson(Map<String, dynamic> json) => AlertItem(
    id: json['id'] as int,
    deviceId: json['device_id'] as String? ?? '',
    severity: json['severity'] as String? ?? 'warning',
    message: json['message'] as String? ?? '',
    source: json['source'] as String? ?? '',
    acknowledged: json['acknowledged'] == true,
    createdAt: _time(json['created_at']),
  );

  final int id;
  final String deviceId;
  final String severity;
  final String message;
  final String source;
  final bool acknowledged;
  final DateTime? createdAt;
}

class Schedule {
  Schedule({required this.id, required this.time, required this.duration, required this.days, required this.active});

  factory Schedule.fromJson(Map<String, dynamic> json) => Schedule(
    id: json['id'] as int,
    time: json['time'] as String? ?? '',
    duration: (json['duration'] as num?)?.toInt() ?? 0,
    days: json['days'] as String? ?? '',
    active: json['active'] == true,
  );

  final int id;
  final String time;
  final int duration;
  final String days;
  final bool active;

  static const dayOptions = ['Setiap hari', 'Senin - Jumat', 'Akhir pekan'];
}

class Command {
  Command({required this.id, required this.actuator, required this.value, required this.status});

  factory Command.fromJson(Map<String, dynamic> json) => Command(
    id: json['id'] as String,
    actuator: json['actuator'] as String? ?? '',
    value: json['value'] == true,
    status: json['status'] as String? ?? 'pending',
  );

  final String id;
  final String actuator;
  final bool value;
  final String status;
}

/// Rekomendasi Layanan AI Flask, diteruskan backend PHP.
class Recommendation {
  Recommendation({
    required this.id,
    required this.condition,
    required this.source,
    required this.confidence,
    required this.reasons,
    required this.actions,
    required this.modelVersion,
    required this.simulationReadings,
  });

  factory Recommendation.fromJson(Map<String, dynamic> json) {
    final rec = json['recommendation'] as Map<String, dynamic>;
    final model = rec['model'];
    final input = json['input'];
    return Recommendation(
      id: rec['id'] as String,
      condition: rec['condition'] as String? ?? 'normal',
      source: rec['source'] as String? ?? 'aturan',
      confidence: _double(rec['confidence']),
      reasons: List<String>.from(rec['reasons'] as List? ?? const []),
      actions: List<String>.from(rec['actions'] as List? ?? const []),
      modelVersion: model is Map<String, dynamic> ? model['version'] as String? : null,
      simulationReadings: input is Map<String, dynamic> ? (input['simulation_readings'] as num?)?.toInt() ?? 0 : 0,
    );
  }

  final String id;
  final String condition;
  final String source;
  final double? confidence;
  final List<String> reasons;
  final List<String> actions;
  final String? modelVersion;
  final int simulationReadings;
}
