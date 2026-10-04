import 'package:flutter/material.dart';

import '../state/app_state.dart';
import 'alerts_screen.dart';
import 'control_screen.dart';
import 'dashboard_screen.dart';
import 'history_screen.dart';
import 'schedule_screen.dart';
import 'widgets.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  static const _titles = ['Ringkasan', 'Riwayat', 'Peringatan', 'Kontrol', 'Jadwal pakan'];

  Future<void> _logout() async {
    if (!await confirm(context, 'Keluar?', 'Anda perlu login lagi untuk memantau kolam.', action: 'Keluar')) return;
    if (!mounted) return;
    try {
      await AppScope.read(context).logout();
    } catch (error) {
      if (mounted) showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final device = state.selected;
    final pages = [
      const DashboardScreen(),
      const HistoryScreen(),
      const AlertsScreen(),
      const ControlScreen(),
      const ScheduleScreen(),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_tab]),
        actions: [IconButton(tooltip: 'Keluar', icon: const Icon(Icons.logout), onPressed: _logout)],
        bottom: state.devices.length > 1 && device != null
            ? PreferredSize(
                preferredSize: const Size.fromHeight(56),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                  child: DropdownButtonFormField<String>(
                    key: const Key('device-picker'),
                    initialValue: device.id,
                    isExpanded: true,
                    dropdownColor: Colors.white,
                    decoration: const InputDecoration(
                      filled: true,
                      fillColor: Colors.white,
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final d in state.devices)
                        DropdownMenuItem(
                          value: d.id,
                          child: Text('${d.name} · ${d.id}', overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (id) => id == null ? null : state.select(id),
                  ),
                ),
              )
            : null,
      ),
      body: state.devices.isEmpty
          ? const MessageView(
              icon: Icons.sensors_off,
              title: 'Belum ada perangkat',
              message: 'Tambahkan perangkat dari aplikasi web AquaSmart, lalu tarik untuk memuat ulang.',
            )
          // Kunci per perangkat: ganti perangkat memulai ulang halaman sehingga data perangkat lain tidak tercampur.
          : KeyedSubtree(key: ValueKey('${device!.id}-$_tab'), child: pages[_tab]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Ringkasan'),
          const NavigationDestination(icon: Icon(Icons.show_chart), label: 'Riwayat'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: state.unacknowledged > 0,
              label: Text('${state.unacknowledged}'),
              child: const Icon(Icons.notifications_outlined),
            ),
            label: 'Peringatan',
          ),
          const NavigationDestination(icon: Icon(Icons.toggle_on_outlined), label: 'Kontrol'),
          const NavigationDestination(icon: Icon(Icons.schedule), label: 'Jadwal'),
        ],
      ),
    );
  }
}
