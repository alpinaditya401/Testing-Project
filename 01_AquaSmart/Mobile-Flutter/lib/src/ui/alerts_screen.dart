import 'package:flutter/material.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../util/format.dart';
import 'theme.dart';
import 'widgets.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  late Future<List<AlertItem>> _future;
  bool _openOnly = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final state = AppScope.read(context);
    _future = state.guard((api) async {
      final result = await api.alerts();
      state.setUnacknowledged(result.unacknowledged);
      return result.alerts;
    });
  }

  Future<void> _acknowledge(AlertItem alert) async {
    try {
      await AppScope.read(context).guard((api) => api.acknowledge(alert.id));
      if (!mounted) return;
      showInfo(context, 'Peringatan ditandai sudah ditangani.');
      setState(_load);
    } catch (error) {
      if (mounted) showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = AppScope.of(context).isAdmin;
    return FutureBuilder<List<AlertItem>>(
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
        final alerts = [
          for (final a in snapshot.data!)
            if (!_openOnly || !a.acknowledged) a,
        ];
        return RefreshIndicator(
          onRefresh: () async => setState(_load),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Hanya yang belum ditangani'),
                value: _openOnly,
                onChanged: (v) => setState(() => _openOnly = v),
              ),
              if (alerts.isEmpty)
                const MessageView(icon: Icons.notifications_none, title: 'Tidak ada peringatan')
              else
                for (final alert in alerts) ...[
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            StatusChip(
                              label: alert.severity == 'critical' ? 'Kritis' : 'Peringatan',
                              color: alert.severity == 'critical' ? AquaColors.danger : AquaColors.warning,
                            ),
                            if (alert.acknowledged)
                              const StatusChip(label: 'Sudah ditangani', color: AquaColors.normal),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(alert.message),
                        const SizedBox(height: 4),
                        Text(
                          '${alert.deviceId} · ${ago(alert.createdAt)} · ${alert.source}',
                          style: const TextStyle(color: AquaColors.muted),
                        ),
                        if (isAdmin && !alert.acknowledged)
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton.icon(
                              onPressed: () => _acknowledge(alert),
                              icon: const Icon(Icons.check),
                              label: const Text('Tandai ditangani'),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
            ],
          ),
        );
      },
    );
  }
}
