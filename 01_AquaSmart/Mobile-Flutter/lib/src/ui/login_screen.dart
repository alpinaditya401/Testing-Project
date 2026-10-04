import 'package:flutter/material.dart';

import '../state/app_state.dart';
import 'theme.dart';
import 'widgets.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _server = TextEditingController(text: defaultServer);
  bool _busy = false;
  bool _hidden = true;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _server.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AppScope.read(context).login(_server.text, _username.text.trim(), _password.text);
    } catch (error) {
      if (mounted) setState(() => _error = errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _form,
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'AquaSmart AIoT',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AquaColors.navy),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Lele sehat. Selada tumbuh. Keputusan berbasis data.',
                      style: TextStyle(color: AquaColors.muted),
                    ),
                    const SizedBox(height: 28),
                    TextFormField(
                      controller: _username,
                      decoration: const InputDecoration(
                        labelText: 'Email, nomor WA, atau username',
                        border: OutlineInputBorder(),
                      ),
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      validator: (v) => (v ?? '').trim().isEmpty ? 'Isi akun Anda.' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _password,
                      obscureText: _hidden,
                      decoration: InputDecoration(
                        labelText: 'Kata sandi',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          tooltip: _hidden ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi',
                          icon: Icon(_hidden ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _hidden = !_hidden),
                        ),
                      ),
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _submit(),
                      validator: (v) => (v ?? '').isEmpty ? 'Isi kata sandi.' : null,
                    ),
                    ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      title: const Text('Alamat server'),
                      children: [
                        TextFormField(
                          controller: _server,
                          keyboardType: TextInputType.url,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            helperText: 'Emulator Android ke server lokal: http://10.0.2.2:8080',
                          ),
                          validator: (v) {
                            final uri = Uri.tryParse((v ?? '').trim());
                            return uri != null && (uri.scheme == 'https' || uri.scheme == 'http') && uri.host.isNotEmpty
                                ? null
                                : 'Alamat harus diawali http:// atau https://';
                          },
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _error!,
                          key: const Key('login-error'),
                          style: const TextStyle(color: AquaColors.danger),
                        ),
                      ),
                    FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Memeriksa akun…' : 'Masuk')),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
