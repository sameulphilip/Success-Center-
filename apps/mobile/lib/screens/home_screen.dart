import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api_client.dart';
import '../theme.dart';
import 'ops_desk_screen.dart';
import 'parent_screen.dart';
import 'teacher_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.onLogout});

  final ApiClient api;
  final Future<void> Function() onLogout;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? user;
  String? error;
  int tab = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user');
      if (raw != null) {
        setState(() => user = jsonDecode(raw) as Map<String, dynamic>);
      }
      final me = await widget.api.me();
      setState(() => user = me);
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  bool get _isDeskRole {
    final role = user?['role'] as String? ?? '';
    return role == 'RECEPTION' ||
        role == 'CENTER_MANAGER' ||
        role == 'SUPER_ADMIN';
  }

  bool get _isTeacher {
    final role = user?['role'] as String? ?? '';
    return role == 'TEACHER' || role == 'SUPER_ADMIN';
  }

  bool get _isParentOrStudent {
    final role = user?['role'] as String? ?? '';
    return role == 'PARENT' || role == 'STUDENT';
  }

  @override
  Widget build(BuildContext context) {
    final name = user == null ? '...' : '${user!['fullName']}';
    final role = user?['role'] as String? ?? '';

    Widget body;
    if (user == null) {
      body = Center(
        child: error == null
            ? const CircularProgressIndicator(color: SuccessColors.navy)
            : Text(error!),
      );
    } else if (_isParentOrStudent) {
      body = ParentScreen(api: widget.api, user: user!);
    } else if (_isDeskRole) {
      final pages = <Widget>[
        OpsDeskScreen(api: widget.api, user: user!),
        if (_isTeacher) TeacherScreen(api: widget.api, user: user!),
      ];
      body = pages[tab.clamp(0, pages.length - 1)];
    } else if (_isTeacher) {
      body = TeacherScreen(api: widget.api, user: user!);
    } else {
      body = const Center(child: Text('استخدم لوحة الإدارة للصلاحية الحالية'));
    }

    final showBottom = user != null && _isDeskRole && _isTeacher;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: Row(
          children: [
            Image.asset(
              'assets/brand/success-logo.png',
              width: 34,
              height: 34,
              fit: BoxFit.contain,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Success'),
                  const Text(
                    'Eslam Atya',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: SuccessColors.goldSoft,
                    ),
                  ),
                  Text(
                    '$name · $role',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: SuccessColors.goldSoft,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: body,
      bottomNavigationBar: showBottom
          ? NavigationBar(
              selectedIndex: tab,
              onDestinationSelected: (i) => setState(() => tab = i),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.point_of_sale_outlined),
                  label: 'تشغيل',
                ),
                NavigationDestination(
                  icon: Icon(Icons.school_outlined),
                  label: 'مدرس',
                ),
              ],
            )
          : (_isDeskRole && !_isTeacher
              ? null
              : null),
    );
  }
}
