import 'package:flutter/material.dart';
import '../api_client.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class QrAttendanceScreen extends StatefulWidget {
  const QrAttendanceScreen({
    super.key,
    required this.api,
    required this.groups,
  });

  final ApiClient api;
  final List<dynamic> groups;

  @override
  State<QrAttendanceScreen> createState() => _QrAttendanceScreenState();
}

class _QrAttendanceScreenState extends State<QrAttendanceScreen> {
  final payloadCtrl = TextEditingController();
  String? groupId;
  String? message;
  String? error;
  bool loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.groups.isNotEmpty) {
      groupId = widget.groups.first['id'] as String?;
    }
  }

  Future<void> submit() async {
    if (groupId == null || payloadCtrl.text.trim().isEmpty) return;
    setState(() {
      loading = true;
      error = null;
      message = null;
    });
    try {
      final res = await widget.api.postJson('/attendance/qr', {
        'payload': payloadCtrl.text.trim(),
        'groupId': groupId,
        'source': 'QR_STUDENT',
      }) as Map<String, dynamic>;
      setState(() {
        message =
            'تم حضور ${res['student']?['name'] ?? ''} — إشعارات أولياء: ${res['parentsNotified'] ?? 0}';
        payloadCtrl.clear();
      });
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('مسح QR للحضور')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SuccessHero(
            title: 'تسجيل حضور QR',
            subtitle: 'الصق بيانات QR أو studentUid ثم أكّد الحضور',
          ),
          const SizedBox(height: 16),
          const SectionLabel('المجموعة'),
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: DropdownButtonFormField<String>(
                value: groupId,
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
                items: widget.groups
                    .map(
                      (g) => DropdownMenuItem(
                        value: g['id'] as String,
                        child: Text(
                          '${g['subject']?['nameEn'] ?? ''} — ${g['name']}',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() => groupId = v),
              ),
            ),
          ),
          const SizedBox(height: 14),
          const SectionLabel('محتوى QR'),
          TextField(
            controller: payloadCtrl,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: '{"type":"student","uid":"..."} أو uid',
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: loading ? null : submit,
            child: Text(loading ? '...' : 'تسجيل الحضور وإشعار ولي الأمر'),
          ),
          if (message != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(message!, style: const TextStyle(color: Color(0xFF065F46))),
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF1F2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(error!, style: const TextStyle(color: Color(0xFFB91C1C))),
            ),
          ],
        ],
      ),
    );
  }
}
