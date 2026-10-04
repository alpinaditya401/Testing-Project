import 'package:flutter/material.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../util/format.dart';
import 'theme.dart';
import 'widgets.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<Reading>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final state = AppScope.read(context);
    final id = state.selected!.id;
    _future = state.guard((api) => api.readings(id, limit: 36));
  }

  @override
  Widget build(BuildContext context) {
    final t = AppScope.of(context).thresholds!;
    return FutureBuilder<List<Reading>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) {
          return MessageView(
            icon: Icons.cloud_off,
            title: errorMessage(snapshot.error!),
            onRetry: () => setState(_load),
          );
        }
        final rows = snapshot.data!;
        if (rows.isEmpty) return const MessageView(icon: Icons.show_chart, title: 'Belum ada riwayat pembacaan');
        return RefreshIndicator(
          onRefresh: () async => setState(_load),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('${rows.length} pembacaan terakhir', style: const TextStyle(color: AquaColors.muted)),
              const SizedBox(height: 8),
              _Trend('pH', '', [for (final r in rows) r.ph], t.phMin, t.phMax),
              const SizedBox(height: 12),
              _Trend('Suhu', '°C', [for (final r in rows) r.temperature], t.temperatureMin, t.temperatureMax),
              const SizedBox(height: 12),
              _Trend('Kekeruhan', 'NTU', [for (final r in rows) r.turbidity], 0, t.turbidityMax),
              const SizedBox(height: 16),
              SectionCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final r in rows.reversed.take(12))
                      ListTile(
                        dense: true,
                        title: Text(
                          'pH ${decimal(r.ph)} · ${decimal(r.temperature)} °C · ${decimal(r.turbidity, 0)} NTU',
                        ),
                        subtitle: Text('${ago(r.time)} · ${provenanceLabel(r)}'),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Trend extends StatelessWidget {
  const _Trend(this.label, this.unit, this.values, this.low, this.high);

  final String label;
  final String unit;
  final List<double?> values;
  final double low;
  final double high;

  @override
  Widget build(BuildContext context) {
    final known = values.whereType<double>().toList();
    final summary = known.isEmpty
        ? 'tidak ada data'
        : 'terakhir ${decimal(known.last)} $unit, rentang ${decimal(known.reduce((a, b) => a < b ? a : b))}–'
              '${decimal(known.reduce((a, b) => a > b ? a : b))} $unit';
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.titleSmall),
          Text(summary, style: const TextStyle(color: AquaColors.muted)),
          const SizedBox(height: 8),
          Semantics(
            label: 'Grafik $label, $summary. Pita hijau adalah ambang aman.',
            child: SizedBox(
              height: 90,
              width: double.infinity,
              child: CustomPaint(painter: _TrendPainter(values, low, high)),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.values, this.low, this.high);

  final List<double?> values;
  final double low;
  final double high;

  @override
  void paint(Canvas canvas, Size size) {
    final known = values.whereType<double>();
    if (known.isEmpty) return;
    var minV = [low, ...known].reduce((a, b) => a < b ? a : b);
    var maxV = [high, ...known].reduce((a, b) => a > b ? a : b);
    if (maxV - minV < 1e-9) {
      minV -= 1;
      maxV += 1;
    }
    double y(double v) => size.height - (v - minV) / (maxV - minV) * size.height;
    canvas.drawRect(
      Rect.fromLTRB(0, y(high), size.width, y(low)),
      Paint()..color = AquaColors.normal.withValues(alpha: 0.12),
    );
    final path = Path();
    var started = false;
    for (var i = 0; i < values.length; i++) {
      final v = values[i];
      if (v == null) continue;
      final x = values.length == 1 ? size.width / 2 : i / (values.length - 1) * size.width;
      started ? path.lineTo(x, y(v)) : path.moveTo(x, y(v));
      started = true;
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = AquaColors.navy
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(_TrendPainter old) => old.values != values || old.low != low || old.high != high;
}
