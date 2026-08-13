import 'package:flutter_test/flutter_test.dart';
import 'package:center_erp_mobile/main.dart';

void main() {
  testWidgets('App boots', (tester) async {
    await tester.pumpWidget(const CenterErpApp());
    await tester.pump();
    expect(find.byType(CenterErpApp), findsOneWidget);
  });
}
