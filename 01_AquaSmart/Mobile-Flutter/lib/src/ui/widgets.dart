import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../util/format.dart';
import 'theme.dart';

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.child, this.padding = const EdgeInsets.all(16)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Card(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: const BorderSide(color: Color(0xFFD6E2E2)),
    ),
    child: Padding(padding: padding, child: child),
  );
}

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.color});

  factory StatusChip.level(Level level) => switch (level) {
    Level.normal => const StatusChip(label: 'Normal', color: AquaColors.normal),
    Level.outOfRange => const StatusChip(label: 'Di luar ambang', color: AquaColors.danger),
    Level.unknown => const StatusChip(label: 'Tidak ada data', color: AquaColors.muted),
  };

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: color),
    ),
    child: Text(
      label,
      style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12),
    ),
  );
}

class MetricTile extends StatelessWidget {
  const MetricTile({super.key, required this.label, required this.value, required this.unit, required this.level});

  final String label;
  final String value;
  final String unit;
  final Level level;

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    label: '$label $value $unit',
    child: SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: AquaColors.muted, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: value,
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
                ),
                TextSpan(
                  text: unit.isEmpty ? '' : ' $unit',
                  style: const TextStyle(color: AquaColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          StatusChip.level(level),
        ],
      ),
    ),
  );
}

/// Kontrol perangkat di backend masih SIMULASI; label ini wajib tampil di layar kontrol.
class SimulationBanner extends StatelessWidget {
  const SimulationBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF4D6),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AquaColors.warning),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.science_outlined, color: AquaColors.warning),
        const SizedBox(width: 8),
        Expanded(
          child: Text(message, style: const TextStyle(color: Color(0xFF5C3D00))),
        ),
      ],
    ),
  );
}

class MessageView extends StatelessWidget {
  const MessageView({super.key, required this.icon, required this.title, this.message, this.onRetry});

  final IconData icon;
  final String title;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: AquaColors.muted),
          const SizedBox(height: 12),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AquaColors.muted),
            ),
          ],
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Coba lagi')),
          ],
        ],
      ),
    ),
  );
}

String errorMessage(Object error) => error is ApiException ? error.message : 'Terjadi kesalahan. Coba lagi.';

void showError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(errorMessage(error)), backgroundColor: AquaColors.danger));
}

void showInfo(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

Future<bool> confirm(BuildContext context, String title, String message, {String action = 'Lanjutkan'}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(action)),
        ],
      ),
    ) ??
    false;
