import 'package:flutter/material.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  late Future<List<Schedule>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final state = AppScope.read(context);
    final id = state.selected!.id;
    _future = state.guard((api) => api.schedules(id));
  }

  Future<void> _add() async {
    final state = AppScope.read(context);
    final picked = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 7, minute: 0));
    if (picked == null || !mounted) return;
    var duration = 8;
    var days = Schedule.dayOptions.first;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: Text('Jadwal ${picked.format(context)}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                initialValue: duration,
                decoration: const InputDecoration(labelText: 'Durasi motor (detik)'),
                items: [for (var s = 1; s <= 30; s++) DropdownMenuItem(value: s, child: Text('$s detik'))],
                onChanged: (v) => setDialog(() => duration = v ?? duration),
              ),
              DropdownButtonFormField<String>(
                initialValue: days,
                decoration: const InputDecoration(labelText: 'Hari'),
                items: [for (final d in Schedule.dayOptions) DropdownMenuItem(value: d, child: Text(d))],
                onChanged: (v) => setDialog(() => days = v ?? days),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Simpan')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final time = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    try {
      await state.guard((api) => api.createSchedule(state.selected!.id, time, duration, days));
      if (!mounted) return;
      showInfo(context, 'Jadwal $time disimpan.');
      setState(_load);
    } catch (error) {
      if (mounted) showError(context, error);
    }
  }

  Future<void> _delete(Schedule schedule) async {
    if (!await confirm(
      context,
      'Hapus jadwal ${schedule.time}?',
      'Jadwal ini tidak akan dijalankan lagi.',
      action: 'Hapus',
    )) {
      return;
    }
    if (!mounted) return;
    try {
      await AppScope.read(context).guard((api) => api.deleteSchedule(schedule.id));
      if (mounted) setState(_load);
    } catch (error) {
      if (mounted) showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = AppScope.of(context).isAdmin;
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: isAdmin
          ? FloatingActionButton.extended(
              onPressed: _add,
              icon: const Icon(Icons.add),
              label: const Text('Tambah jadwal'),
            )
          : null,
      body: FutureBuilder<List<Schedule>>(
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
          final schedules = snapshot.data!;
          return RefreshIndicator(
            onRefresh: () async => setState(_load),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                const Text(
                  'Jadwal dijalankan server dalam mode simulasi; feeder fisik belum terhubung.',
                  style: TextStyle(color: AquaColors.muted),
                ),
                const SizedBox(height: 12),
                if (schedules.isEmpty)
                  const MessageView(icon: Icons.schedule, title: 'Belum ada jadwal pakan')
                else
                  SectionCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (final s in schedules)
                          ListTile(
                            leading: const Icon(Icons.alarm),
                            title: Text('${s.time} · ${s.duration} detik'),
                            subtitle: Text(s.days + (s.active ? '' : ' · nonaktif')),
                            trailing: isAdmin
                                ? IconButton(
                                    tooltip: 'Hapus jadwal ${s.time}',
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () => _delete(s),
                                  )
                                : null,
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
