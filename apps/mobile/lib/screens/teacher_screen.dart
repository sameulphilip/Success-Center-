import 'package:flutter/material.dart';
import '../api_client.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'qr_attendance_screen.dart';

class TeacherScreen extends StatefulWidget {
  const TeacherScreen({super.key, required this.api, required this.user});

  final ApiClient api;
  final Map<String, dynamic> user;

  @override
  State<TeacherScreen> createState() => _TeacherScreenState();
}

class _TeacherScreenState extends State<TeacherScreen> {
  List<dynamic> groups = [];
  Map<String, dynamic>? session;
  String? message;

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    final teacherId = widget.user['teacherId'];
    if (teacherId == null) {
      final all = await widget.api.getList('/groups');
      setState(() => groups = all);
      return;
    }
    final teacher = await widget.api.getJson('/teachers/$teacherId');
    setState(() => groups = (teacher['groups'] as List?) ?? []);
  }

  Future<void> openSession(String groupId) async {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final created = await widget.api.postJson('/attendance/sessions', {
      'groupId': groupId,
      'sessionDate': today,
    }) as Map<String, dynamic>;
    final full =
        await widget.api.getJson('/attendance/sessions/${created['id']}');
    setState(() {
      session = full;
      message = 'تم فتح جلسة الحضور';
    });
  }

  Future<void> mark(String studentId, String status) async {
    if (session == null) return;
    await widget.api.postJson('/attendance/mark', {
      'sessionId': session!['id'],
      'records': [
        {'studentId': studentId, 'status': status, 'source': 'MANUAL'},
      ],
    });
    final full =
        await widget.api.getJson('/attendance/sessions/${session!['id']}');
    setState(() {
      session = full;
      message = status == 'ABSENT'
          ? 'غائب — تم إرسال إشعار لولي الأمر'
          : 'تم تسجيل الحضور';
    });
  }

  @override
  Widget build(BuildContext context) {
    final enrollments =
        (session?['group']?['enrollments'] as List?) ?? const [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SuccessHero(
          title: 'لوحة المدرس',
          subtitle: 'حضور يدوي · QR · إشعارات أولياء الأمور',
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: groups.isEmpty
              ? null
              : () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => QrAttendanceScreen(
                        api: widget.api,
                        groups: groups,
                      ),
                    ),
                  );
                },
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('مسح QR للحضور'),
          style: FilledButton.styleFrom(
            backgroundColor: SuccessColors.gold,
            foregroundColor: SuccessColors.navyDeep,
          ),
        ),
        const SizedBox(height: 18),
        const SectionLabel('مجموعاتي'),
        if (groups.isEmpty) const EmptyHint('لا توجد مجموعات مرتبطة'),
        ...groups.map((g) {
          final subject = g['subject']?['nameEn'] ?? '';
          final name = g['name'] ?? '';
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: SuccessColors.goldSoft,
                      child: Text(
                        subject.toString().isNotEmpty ? subject[0] : 'G',
                        style: const TextStyle(
                          color: SuccessColors.navy,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$subject — $name',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: SuccessColors.navy,
                            ),
                          ),
                          Text(
                            g['gradeLevel']?['nameEn']?.toString() ?? '',
                            style: const TextStyle(
                              color: Colors.black54,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    FilledButton(
                      onPressed: () => openSession(g['id'] as String),
                      child: const Text('حضور'),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
        if (message != null) ...[
          const SizedBox(height: 8),
          Text(
            message!,
            style: const TextStyle(
              color: SuccessColors.navy,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        if (session != null) ...[
          const SizedBox(height: 14),
          const SectionLabel('كشف الحضور'),
          ...enrollments.map((e) {
            final student = e['student'] as Map<String, dynamic>;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: ListTile(
                  title: Text(
                    '${student['firstName']} ${student['lastName']}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  trailing: Wrap(
                    spacing: 6,
                    children: [
                      FilledButton.tonal(
                        onPressed: () => mark(e['studentId'], 'PRESENT'),
                        child: const Text('حاضر'),
                      ),
                      OutlinedButton(
                        onPressed: () => mark(e['studentId'], 'ABSENT'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFB91C1C),
                          side: const BorderSide(color: Color(0xFFFECACA)),
                        ),
                        child: const Text('غائب'),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
      ],
    );
  }
}
