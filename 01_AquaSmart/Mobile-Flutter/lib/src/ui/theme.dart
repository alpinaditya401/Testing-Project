import 'package:flutter/material.dart';

/// Palet navy-aqua dari SKPL Bab VII. Kontras teks memenuhi WCAG AA.
abstract final class AquaColors {
  static const navy = Color(0xFF16384A);
  static const aqua = Color(0xFF0F7F73);
  static const foam = Color(0xFFF2F7F7);
  static const normal = Color(0xFF0B6B5F);
  static const warning = Color(0xFF8A5A00);
  static const danger = Color(0xFFB3261E);
  static const muted = Color(0xFF52606D);
}

ThemeData aquaTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: AquaColors.aqua, primary: AquaColors.aqua, secondary: AquaColors.navy);
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: AquaColors.foam,
    appBarTheme: const AppBarTheme(backgroundColor: AquaColors.navy, foregroundColor: Colors.white),
    cardTheme: const CardThemeData(margin: EdgeInsets.zero, elevation: 0),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(48, 48), backgroundColor: AquaColors.aqua),
    ),
    materialTapTargetSize: MaterialTapTargetSize.padded,
  );
}
