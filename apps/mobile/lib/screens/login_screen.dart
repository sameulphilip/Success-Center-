import 'package:flutter/material.dart';
import '../api_client.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLoggedIn});

  final ApiClient api;
  final Future<void> Function() onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailCtrl = TextEditingController(text: 'student@center.local');
  final passCtrl = TextEditingController(text: 'Student@123');
  String? error;
  bool loading = false;

  Future<void> submit() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await widget.api.login(emailCtrl.text.trim(), passCtrl.text);
      await widget.onLoggedIn();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SuccessColors.sand,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          children: [
            const SizedBox(height: 12),
            Center(
              child: Image.asset(
                'assets/brand/success-logo.png',
                width: 148,
                height: 148,
                fit: BoxFit.contain,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'FUTURE BEGINS HERE',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: SuccessColors.navy.withValues(alpha: 0.55),
                fontSize: 11,
                letterSpacing: 2.8,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 28),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: SuccessColors.mist),
                boxShadow: [
                  BoxShadow(
                    color: SuccessColors.navy.withValues(alpha: 0.06),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'تسجيل الدخول',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: SuccessColors.navy,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'مدرس · ولي أمر · طالب',
                    style: TextStyle(color: Colors.black54, fontSize: 13),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'البريد الإلكتروني'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: passCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'كلمة المرور'),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF1F2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(error!, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 13)),
                    ),
                  ],
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: loading ? null : submit,
                    child: Text(loading ? '...' : 'دخول'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'طالب: student@center.local / Student@123\nمدرس: teacher@center.local / Teacher@123\nولي أمر: parent@center.local / Parent@123',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: Colors.black38, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}
