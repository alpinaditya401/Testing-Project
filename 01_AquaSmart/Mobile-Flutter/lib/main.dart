import 'package:flutter/material.dart';

import 'src/state/app_state.dart';
import 'src/ui/home_shell.dart';
import 'src/ui/login_screen.dart';
import 'src/ui/theme.dart';

void main() => runApp(AquaSmartApp(state: AppState()));

class AquaSmartApp extends StatelessWidget {
  const AquaSmartApp({super.key, required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) => AppScope(
    state: state,
    child: MaterialApp(
      title: 'AquaSmart',
      debugShowCheckedModeBanner: false,
      theme: aquaTheme(),
      home: Builder(builder: (context) => AppScope.of(context).signedIn ? const HomeShell() : const LoginScreen()),
    ),
  );
}
