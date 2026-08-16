import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CenterErpApp());
}

class CenterErpApp extends StatefulWidget {
  const CenterErpApp({super.key});

  @override
  State<CenterErpApp> createState() => _CenterErpAppState();
}

class _CenterErpAppState extends State<CenterErpApp> {
  final api = ApiClient();
  bool loading = true;
  bool loggedIn = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('accessToken');
    if (token != null && token.isNotEmpty) {
      api.token = token;
      loggedIn = true;
    }
    setState(() => loading = false);
  }

  Future<void> onLoggedIn() async {
    setState(() => loggedIn = true);
  }

  Future<void> onLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('accessToken');
    await prefs.remove('refreshToken');
    await prefs.remove('user');
    api.token = null;
    setState(() => loggedIn = false);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Success Center',
      debugShowCheckedModeBanner: false,
      theme: buildSuccessTheme(),
      home: loading
          ? Scaffold(
              backgroundColor: SuccessColors.sand,
              body: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset('assets/brand/success-logo.png', width: 120),
                    const SizedBox(height: 8),
                    const Text(
                      'Success',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: SuccessColors.navy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Eslam Atya',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: SuccessColors.gold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const CircularProgressIndicator(color: SuccessColors.navy),
                  ],
                ),
              ),
            )
          : loggedIn
              ? HomeScreen(api: api, onLogout: onLogout)
              : LoginScreen(api: api, onLoggedIn: onLoggedIn),
    );
  }
}
