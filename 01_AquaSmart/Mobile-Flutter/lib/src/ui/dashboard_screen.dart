import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../util/format.dart';
import 'theme.dart';
import 'widgets.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Sama dengan dashboard web: data diambil ulang setiap 15 detik selama layar terbuka.
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _refresh(quiet: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh({bool quiet = false}) async {
    try {
      await AppScope.read(context).refresh();
    } catch (error) {
      if (mounted && !quiet) showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final device = state.selected!;
    final t = state.thresholds!;
    final reading = device.latest;
    final stale = isStale(reading?.time);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: Row(
              children: [
                Icon(
                  device.online ? Icons.wifi : Icons.wifi_off,
                  color: device.online ? AquaColors.normal : AquaColors.danger,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(device.name, style: Theme.of(context).textTheme.titleMedium),
                      Text(
                        '${device.location} · ${device.online ? 'Online' : 'Offline'} · terakhir ${ago(device.lastSeen)}',
                        style: const TextStyle(color: AquaColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (reading == null)
            const MessageView(
              icon: Icons.sensors,
              title: 'Belum ada pembacaan',
              message: 'Perangkat belum mengirim data.',
            )
          else ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                StatusChip(
                  label: provenanceLabel(reading),
                  color: reading.simulation ? AquaColors.warning : AquaColors.navy,
                ),
                if (stale) const StatusChip(label: 'Data lama', color: AquaColors.warning),
                Text('Dibaca ${ago(reading.time)}', style: const TextStyle(color: AquaColors.muted)),
              ],
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, box) {
                final columns = box.maxWidth >= 600 ? 3 : 1;
                final width = (box.maxWidth - 12 * (columns - 1)) / columns;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: width,
                      child: MetricTile(
                        label: 'pH',
                        value: decimal(reading.ph),
                        unit: '',
                        level: levelOf('ph', reading.ph, t),
                      ),
                    ),
                    SizedBox(
                      width: width,
                      child: MetricTile(
                        label: 'Suhu',
                        value: decimal(reading.temperature),
                        unit: '°C',
                        level: levelOf('temperature', reading.temperature, t),
                      ),
                    ),
                    SizedBox(
                      width: width,
                      child: MetricTile(
                        label: 'Kekeruhan',
                        value: decimal(reading.turbidity, 0),
                        unit: 'NTU',
                        level: levelOf('turbidity', reading.turbidity, t),
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
          const SizedBox(height: 12),
          RecommendationCard(deviceId: device.id),
          const SizedBox(height: 12),
          Text(
            'Ambang: pH ${decimal(t.phMin)}–${decimal(t.phMax)}, suhu ${decimal(t.temperatureMin)}–${decimal(t.temperatureMax)} °C, '
            'kekeruhan ≤ ${decimal(t.turbidityMax, 0)} NTU.',
            style: const TextStyle(color: AquaColors.muted),
          ),
        ],
      ),
    );
  }
}

/// Rekomendasi Layanan AI (FR-16) dengan umpan balik (FR-17).
class RecommendationCard extends StatefulWidget {
  const RecommendationCard({super.key, required this.deviceId});

  final String deviceId;

  @override
  State<RecommendationCard> createState() => _RecommendationCardState();
}

class _RecommendationCardState extends State<RecommendationCard> {
  late Future<Recommendation> _future;
  bool? _sent;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _sent = null;
    _future = AppScope.read(context).guard((api) => api.recommendation(widget.deviceId));
  }

  Future<void> _feedback(String id, bool helpful) async {
    try {
      await AppScope.read(context).guard((api) => api.feedback(id, helpful));
      if (mounted) setState(() => _sent = helpful);
    } catch (error) {
      if (mounted) showError(context, error);
    }
  }

  static const _conditions = {
    'normal': ('Kondisi normal', AquaColors.normal),
    'waspada': ('Waspada', AquaColors.warning),
    'di_luar_ambang': ('Di luar ambang', AquaColors.danger),
  };

  @override
  Widget build(BuildContext context) => SectionCard(
    child: FutureBuilder<Recommendation>(
      future: _future,
      builder: (context, snapshot) {
        final header = Row(
          children: [
            const Icon(Icons.psychology_outlined, color: AquaColors.navy),
            const SizedBox(width: 8),
            Expanded(child: Text('Rekomendasi', style: Theme.of(context).textTheme.titleMedium)),
            IconButton(
              tooltip: 'Muat ulang rekomendasi',
              icon: const Icon(Icons.refresh),
              onPressed: () => setState(_load),
            ),
          ],
        );
        if (snapshot.connectionState != ConnectionState.done) {
          return Column(children: [header, const LinearProgressIndicator()]);
        }
        if (snapshot.hasError) {
          final error = snapshot.error;
          // ai_unavailable: jembatan ada tetapi belum dikonfigurasi. not_found: backend versi lama tanpa
          // endpoint rekomendasi (deploy yang belum diperbarui).
          final aiMissing = error is ApiException && (error.code == 'ai_unavailable' || error.code == 'not_found');
          final text = aiMissing
              ? 'Layanan AI belum diaktifkan di server. Pemantauan dan peringatan berbasis ambang tetap berjalan.'
              : errorMessage(error!);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              header,
              Text(text, style: const TextStyle(color: AquaColors.muted)),
            ],
          );
        }
        final rec = snapshot.data!;
        final (label, color) = _conditions[rec.condition] ?? ('Kondisi ${rec.condition}', AquaColors.muted);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            header,
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusChip(label: label, color: color),
                StatusChip(
                  label: rec.source == 'model'
                      ? 'Model ${rec.modelVersion ?? ''} · ${((rec.confidence ?? 0) * 100).round()}%'
                      : 'Aturan ambang',
                  color: AquaColors.navy,
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final reason in rec.reasons) Text('• $reason'),
            if (rec.actions.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Tindakan: ${rec.actions.join(' ')}', style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
            if (rec.simulationReadings > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '${rec.simulationReadings} pembacaan masukan berasal dari simulasi atau data contoh.',
                  style: const TextStyle(color: AquaColors.warning),
                ),
              ),
            const SizedBox(height: 4),
            const Text(
              'Saran saja: rekomendasi tidak menggerakkan aktuator.',
              style: TextStyle(color: AquaColors.muted),
            ),
            const SizedBox(height: 8),
            if (_sent != null)
              Text(_sent! ? 'Terima kasih, ditandai membantu.' : 'Terima kasih, ditandai tidak sesuai.')
            else
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => _feedback(rec.id, true),
                    icon: const Icon(Icons.thumb_up_outlined),
                    label: const Text('Membantu'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _feedback(rec.id, false),
                    icon: const Icon(Icons.thumb_down_outlined),
                    label: const Text('Tidak sesuai'),
                  ),
                ],
              ),
          ],
        );
      },
    ),
  );
}
