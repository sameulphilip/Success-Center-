import 'package:flutter/material.dart';
import '../api_client.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Lightweight reception desk: open sessions + phone pay/check-in.
class OpsDeskScreen extends StatefulWidget {
  const OpsDeskScreen({super.key, required this.api, required this.user});

  final ApiClient api;
  final Map<String, dynamic> user;

  @override
  State<OpsDeskScreen> createState() => _OpsDeskScreenState();
}

class _OpsDeskScreenState extends State<OpsDeskScreen> {
  List<dynamic> sessions = [];
  String phone = '';
  String? sessionId;
  String method = 'CASH';
  String vodafoneTxn = '';
  String message = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await widget.api.getList('/ops/sessions/open');
      setState(() {
        sessions = list;
        if (list.isNotEmpty && sessionId == null) {
          sessionId = '${list.first['id']}';
        }
      });
    } catch (e) {
      setState(() => message = e.toString());
    }
  }

  Future<void> _pay() async {
    if (sessionId == null || phone.trim().isEmpty) return;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      await widget.api.postJson('/ops/sessions/$sessionId/pay', {
        'phone': phone.trim(),
        'method': method,
        if (method == 'VODAFONE_CASH') 'vodafoneTxn': vodafoneTxn.trim(),
      });
      setState(() => message = 'تم تسجيل الدفع');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم التحصيل — جاهز للدخول بعد التأكيد')),
        );
      }
    } catch (e) {
      setState(() => message = e.toString());
    } finally {
      setState(() => busy = false);
    }
  }

  Future<void> _checkIn() async {
    if (sessionId == null || phone.trim().isEmpty) return;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      final res = await widget.api.postJson('/ops/check-in', {
        'sessionId': sessionId,
        'phone': phone.trim(),
        'source': 'PHONE',
      });
      final name =
          '${res['student']?['firstName'] ?? ''} ${res['student']?['lastName'] ?? ''}'
              .trim();
      setState(() => message = res['alreadyCheckedIn'] == true
          ? 'مسجّل مسبقاً: $name'
          : 'تم الدخول: $name');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      }
    } catch (e) {
      setState(() => message = e.toString());
    } finally {
      setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: SuccessColors.navy,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          const SuccessHero(
            title: 'تشغيل الحصص',
            subtitle: 'تحصيل عند الباب · دخول بعد الدفع المؤكد',
          ),
          const SizedBox(height: 14),
          const SectionLabel('الجلسة المفتوحة'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: DropdownButtonFormField<String>(
                value: sessionId,
                decoration: const InputDecoration(
                  labelText: 'اختر الحصة',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: [
                  for (final s in sessions)
                    DropdownMenuItem(
                      value: '${s['id']}',
                      child: Text(
                        '${s['teacher']?['firstName'] ?? ''} ${s['teacher']?['lastName'] ?? ''}'
                        ' · ${s['subject']?['nameAr'] ?? s['title'] ?? 'حصة'}'
                        ' · ${s['feeAmount']} EGP',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (v) => setState(() => sessionId = v),
              ),
            ),
          ),
          if (sessions.isEmpty)
            const EmptyHint('لا توجد حصص مفتوحة — افتح من الويب أولاً'),
          const SizedBox(height: 12),
          const SectionLabel('الطالب'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  TextField(
                    decoration: const InputDecoration(
                      labelText: 'موبايل الطالب',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    keyboardType: TextInputType.phone,
                    onChanged: (v) => phone = v,
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: method,
                    decoration: const InputDecoration(
                      labelText: 'طريقة الدفع',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(value: 'CASH', child: Text('كاش')),
                      DropdownMenuItem(
                        value: 'VODAFONE_CASH',
                        child: Text('فودافون كاش'),
                      ),
                    ],
                    onChanged: (v) => setState(() => method = v ?? 'CASH'),
                  ),
                  if (method == 'VODAFONE_CASH') ...[
                    const SizedBox(height: 10),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'رقم العملية',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onChanged: (v) => vodafoneTxn = v,
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton(
                          onPressed: busy ? null : _pay,
                          style: FilledButton.styleFrom(
                            backgroundColor: SuccessColors.gold,
                            foregroundColor: SuccessColors.navyDeep,
                            minimumSize: const Size.fromHeight(48),
                          ),
                          child: const Text('تحصيل'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton(
                          onPressed: busy ? null : _checkIn,
                          style: FilledButton.styleFrom(
                            backgroundColor: SuccessColors.navy,
                            minimumSize: const Size.fromHeight(48),
                          ),
                          child: const Text('دخول'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (message.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              message,
              style: TextStyle(
                color: message.contains('Error') || message.contains('Exception')
                    ? Colors.red.shade700
                    : SuccessColors.navy,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
