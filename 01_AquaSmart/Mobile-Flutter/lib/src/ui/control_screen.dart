import 'package:flutter/material.dart';

import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

/// Kontrol manual (FR-10, FR-12). Backend mencatat perintah dan statusnya, tetapi
/// aktuasi fisik belum terbukti; layar tidak boleh mengklaim pompa sudah menyala.
class ControlScreen extends StatefulWidget {
  const ControlScreen({super.key});

  @override
  State<ControlScreen> createState() => _ControlScreenState();
}

class _ControlScreenState extends State<ControlScreen> {
  bool _busy = false;
  double _duration = 8;

  Future<void> _send(String actuator, bool value, String title, String message) async {
    final state = AppScope.read(context);
    final device = state.selected!;
    if (!await confirm(context, title, message, action: 'Kirim perintah')) return;
    setState(() => _busy = true);
    try {
      final result = await state.guard((api) => api.control(device.id, actuator, value, duration: _duration.round()));
      state.replaceDevice(result.device);
      if (mounted) {
        showInfo(
          context,
          result.command == null
              ? 'Mode otomatis diperbarui.'
              : 'Perintah diantrekan (status: ${result.command!.status}). Belum ada bukti aktuasi fisik.',
        );
      }
    } catch (error) {
      if (mounted) showError(context, error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final device = state.selected!;
    final enabled = state.isAdmin && !_busy;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SimulationBanner(
          message:
              'SIMULASI: perintah tercatat dan berpindah status di server, tetapi belum terbukti '
              'menggerakkan pompa, aerator, atau feeder fisik.',
        ),
        if (!state.isAdmin) ...[
          const SizedBox(height: 12),
          const Text('Akun viewer hanya memiliki akses baca.', style: TextStyle(color: AquaColors.muted)),
        ],
        const SizedBox(height: 12),
        SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              SwitchListTile(
                key: const Key('aerator-switch'),
                title: const Text('Aerator'),
                subtitle: Text(device.aerator ? 'Status tercatat: menyala' : 'Status tercatat: mati'),
                value: device.aerator,
                onChanged: enabled
                    ? (v) => _send(
                        'aerator',
                        v,
                        v ? 'Nyalakan aerator?' : 'Matikan aerator?',
                        'Perintah dikirim ke ${device.name}.',
                      )
                    : null,
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Mode otomatis'),
                subtitle: const Text('Jadwal pakan dijalankan otomatis'),
                value: device.auto,
                onChanged: enabled
                    ? (v) => _send(
                        'auto',
                        v,
                        v ? 'Aktifkan mode otomatis?' : 'Matikan mode otomatis?',
                        'Pengaturan berlaku untuk ${device.name}.',
                      )
                    : null,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Beri pakan sekarang', style: Theme.of(context).textTheme.titleMedium),
              Text(
                'Durasi motor ${_duration.round()} detik (bukan takaran gram).',
                style: const TextStyle(color: AquaColors.muted),
              ),
              Slider(
                value: _duration,
                min: 1,
                max: 30,
                divisions: 29,
                label: '${_duration.round()} detik',
                onChanged: enabled ? (v) => setState(() => _duration = v) : null,
              ),
              FilledButton.icon(
                key: const Key('feed-now'),
                onPressed: enabled
                    ? () => _send(
                        'feeder',
                        true,
                        'Beri pakan sekarang?',
                        'Feeder ${device.name} akan berputar ${_duration.round()} detik.',
                      )
                    : null,
                icon: const Icon(Icons.set_meal_outlined),
                label: const Text('Beri pakan'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
