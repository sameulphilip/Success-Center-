import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api_client.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class StudentQrScreen extends StatefulWidget {
  const StudentQrScreen({
    super.key,
    required this.api,
    required this.studentId,
  });

  final ApiClient api;
  final String studentId;

  @override
  State<StudentQrScreen> createState() => _StudentQrScreenState();
}

class _StudentQrScreenState extends State<StudentQrScreen> {
  Map<String, dynamic>? qr;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.getJson('/qr/students/${widget.studentId}');
      setState(() => qr = data);
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('QR الحضور')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SuccessHero(
            title: 'بطاقة الحضور',
            subtitle: 'اعرض هذا الرمز عند دخول الحصة',
          ),
          const SizedBox(height: 20),
          if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
          if (qr == null && error == null)
            const Center(child: CircularProgressIndicator(color: SuccessColors.navy)),
          if (qr != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Text(
                      '${qr!['name']}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: SuccessColors.navy,
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (qr!['qrDataUrl'] != null)
                      Image.memory(
                        Uri.parse(qr!['qrDataUrl'] as String).data!.contentAsBytes(),
                        width: 240,
                        height: 240,
                      ),
                    const SizedBox(height: 12),
                    SelectableText(
                      '${qr!['studentUid']}',
                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(
                          ClipboardData(text: '${qr!['payload']}'),
                        );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('تم نسخ بيانات QR')),
                          );
                        }
                      },
                      icon: const Icon(Icons.copy),
                      label: const Text('نسخ بيانات QR'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
