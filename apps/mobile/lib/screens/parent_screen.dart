import 'package:flutter/material.dart';
import '../api_client.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'student_qr_screen.dart';

const _statusAr = {
  'PRESENT': 'حاضر',
  'ABSENT': 'غائب',
  'LATE': 'متأخر',
  'EXCUSED': 'بعذر',
};

const _sourceAr = {
  'MANUAL': 'يدوي',
  'QR_STUDENT': 'QR',
  'QR_GATE': 'بوابة',
  'NFC_CARD': 'NFC',
};

class ParentScreen extends StatefulWidget {
  const ParentScreen({super.key, required this.api, required this.user});

  final ApiClient api;
  final Map<String, dynamic> user;

  @override
  State<ParentScreen> createState() => _ParentScreenState();
}

class _ParentScreenState extends State<ParentScreen> {
  List<dynamic> notifications = [];
  List<dynamic> children = [];
  Map<String, dynamic>? child;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final notes = await widget.api.getList('/notifications');
      final list = await widget.api.getList('/students/mine/children');
      setState(() {
        notifications = notes;
        children = list;
        if (list.isNotEmpty) {
          final preferredId = widget.user['studentId'];
          child = list.cast<Map<String, dynamic>>().firstWhere(
                (s) => s['id'] == preferredId,
                orElse: () => list.first as Map<String, dynamic>,
              );
        }
      });
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  String _fmtDate(dynamic value) {
    if (value == null) return '—';
    final d = DateTime.tryParse('$value');
    if (d == null) return '—';
    return '${d.year}/${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    if (error != null) {
      return Center(child: Text(error!));
    }

    final role = widget.user['role'] as String? ?? '';
    final isStudent = role == 'STUDENT';
    final enrollments = (child?['enrollments'] as List?) ?? const [];
    final invoices = (child?['invoices'] as List?) ?? const [];
    final grades = (child?['grades'] as List?) ?? const [];
    final attendance = (child?['attendance'] as List?) ?? const [];
    final parents = (child?['parents'] as List?) ?? const [];
    final sessionEntries = (child?['sessionEntries'] as List?) ?? const [];
    final blocks = (child?['blocks'] as List?) ?? const [];
    final presentCount = attendance
        .where((a) => a['status'] == 'PRESENT' || a['status'] == 'LATE')
        .length;
    final absentCount =
        attendance.where((a) => a['status'] == 'ABSENT').length;

    // Soft in-app "push": remind parent when unread-like absence notes exist
    final absenceNotes = notifications
        .where((n) => '${n['title']}'.contains('غياب'))
        .length;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SuccessHero(
          title: child == null
              ? (isStudent ? 'حساب الطالب' : 'حساب ولي الأمر')
              : '${child!['firstName']} ${child!['lastName']}',
          subtitle: isStudent
              ? 'بياناتك · حضورك · درجاتك · QR'
              : 'بيانات الابن · الحضور · المدفوعات · QR',
        ),
        if (children.length > 1) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final s in children)
                ChoiceChip(
                  label: Text('${s['firstName']} ${s['lastName']}'),
                  selected: child?['id'] == s['id'],
                  onSelected: (_) =>
                      setState(() => child = s as Map<String, dynamic>),
                  selectedColor: SuccessColors.goldSoft,
                ),
            ],
          ),
        ],
        if (child != null) ...[
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => StudentQrScreen(
                    api: widget.api,
                    studentId: child!['id'] as String,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.qr_code_2),
            label: Text(isStudent ? 'عرض QR الحضور' : 'QR الابن'),
            style: FilledButton.styleFrom(
              backgroundColor: SuccessColors.gold,
              foregroundColor: SuccessColors.navyDeep,
            ),
          ),
          const SizedBox(height: 16),
          const SectionLabel('البيانات'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('الصف: ${child!['gradeLevel']?['nameAr'] ?? '—'}'),
                  const SizedBox(height: 6),
                  Text('الهاتف: ${child!['phone'] ?? '—'}'),
                  const SizedBox(height: 6),
                  Text('البريد: ${child!['email'] ?? '—'}'),
                  const SizedBox(height: 6),
                  Text(
                    'UID: ${child!['studentUid']}',
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  if (parents.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    const Text(
                      'أولياء الأمور',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    ...parents.map(
                      (p) => Text(
                        '${p['parent']?['firstName'] ?? ''} ${p['parent']?['lastName'] ?? ''}'
                        '${p['parent']?['phone'] != null ? ' · ${p['parent']?['phone']}' : ''}',
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(label: Text('سجلات: ${attendance.length}')),
                      Chip(
                        label: Text('حاضر: $presentCount'),
                        backgroundColor: const Color(0xFFECFDF5),
                      ),
                      Chip(
                        label: Text('غياب: $absentCount'),
                        backgroundColor: const Color(0xFFFEF2F2),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 18),
        if (absenceNotes > 0)
          Card(
            color: const Color(0xFFFFF7ED),
            child: ListTile(
              leading: const Icon(Icons.notifications_active, color: Colors.deepOrange),
              title: Text(
                'تنبيه: $absenceNotes إشعار غياب',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: const Text('راجع قسم الإشعارات بالأسفل'),
            ),
          ),
        const SectionLabel('الإشعارات'),
        if (notifications.isEmpty) const EmptyHint('لا توجد إشعارات بعد'),
        ...notifications.take(15).map(
              (n) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    leading: Icon(
                      (n['title'] as String?)?.contains('غياب') == true
                          ? Icons.warning_amber_rounded
                          : Icons.notifications_none,
                      color: SuccessColors.gold,
                    ),
                    title: Text(
                      '${n['title']}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text('${n['body']}'),
                  ),
                ),
              ),
            ),
        const SectionLabel('المجموعات'),
        if (enrollments.isEmpty) const EmptyHint('لا توجد مجموعات'),
        ...enrollments.map(
          (e) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: SuccessColors.goldSoft,
                  child: Icon(Icons.school, color: SuccessColors.navy, size: 20),
                ),
                title: Text(
                  '${e['group']?['subject']?['nameEn'] ?? e['group']?['subject']?['nameAr'] ?? 'مادة'} — ${e['group']?['name']}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  'المدرس: ${e['group']?['teacher']?['firstName'] ?? ''} ${e['group']?['teacher']?['lastName'] ?? ''}\n'
                  'القاعة: ${e['group']?['classroom']?['name'] ?? '—'}',
                ),
                isThreeLine: true,
              ),
            ),
          ),
        ),
        const SectionLabel('المدفوعات'),
        if (invoices.isEmpty) const EmptyHint('لا توجد فواتير'),
        ...invoices.map((inv) {
          final due = (num.tryParse('${inv['feeAmount']}') ?? 0) -
              (num.tryParse('${inv['discount']}') ?? 0) +
              (num.tryParse('${inv['extras']}') ?? 0) -
              (num.tryParse('${inv['paidAmount']}') ?? 0);
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: ListTile(
                title: Text('${inv['group']?['name'] ?? 'فاتورة'} · ${inv['status']}'),
                subtitle: Text(
                  'المدفوع: ${inv['paidAmount']} EGP',
                ),
                trailing: Text(
                  '${due.toStringAsFixed(0)} EGP',
                  style: const TextStyle(
                    color: SuccessColors.navy,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          );
        }),
        const SectionLabel('مدفوعات الحصص عند الباب'),
        if (sessionEntries.isEmpty) const EmptyHint('لا توجد مدفوعات حصص بعد'),
        ...sessionEntries.map((e) {
          final teacher =
              '${e['session']?['teacher']?['firstName'] ?? ''} ${e['session']?['teacher']?['lastName'] ?? ''}'
                  .trim();
          final subject = e['session']?['subject']?['nameAr'] ?? '';
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: ListTile(
                title: Text(
                  '$teacher${subject.isNotEmpty ? ' · $subject' : ''}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  '${_fmtDate(e['session']?['sessionDate'])} · ${e['payStatus']}'
                  '${e['checkedInAt'] != null ? ' · دخل' : ' · لم يدخل'}',
                ),
                trailing: Text(
                  '${e['amount']} EGP',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          );
        }),
        if (blocks.isNotEmpty) ...[
          const SectionLabel('تنبيهات الحظر'),
          ...blocks.map(
            (b) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                color: const Color(0xFFFEF2F2),
                child: ListTile(
                  leading: Icon(Icons.block, color: Colors.red.shade700),
                  title: Text(
                    b['scope'] == 'CENTER'
                        ? 'حظر من السنتر'
                        : 'حظر من مدرس',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Colors.red.shade800,
                    ),
                  ),
                  subtitle: Text('${b['reason'] ?? ''}'),
                ),
              ),
            ),
          ),
        ],
        const SectionLabel('الدرجات'),
        if (grades.isEmpty) const EmptyHint('لا توجد درجات بعد'),
        ...grades.map(
          (g) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: ListTile(
                title: Text('${g['exam']?['title'] ?? 'Exam'}'),
                subtitle: Text(
                  '${g['exam']?['subject']?['nameEn'] ?? '—'} · ${_fmtDate(g['exam']?['examDate'])}',
                ),
                trailing: Text(
                  '${g['score']}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
        ),
        const SectionLabel('سجل الحضور'),
        if (attendance.isEmpty) const EmptyHint('لا يوجد سجل حضور بعد'),
        ...attendance.map(
          (a) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: ListTile(
                title: Text(
                  _statusAr['${a['status']}'] ?? '${a['status']}',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: a['status'] == 'ABSENT'
                        ? Colors.red.shade700
                        : SuccessColors.navy,
                  ),
                ),
                subtitle: Text(
                  '${a['session']?['group']?['name'] ?? 'حصة'}\n'
                  '${_fmtDate(a['session']?['sessionDate'])} · '
                  '${_sourceAr['${a['source']}'] ?? a['source']}',
                ),
                isThreeLine: true,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
