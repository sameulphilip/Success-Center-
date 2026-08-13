import 'package:flutter/material.dart';

class SuccessColors {
  static const navy = Color(0xFF0B2545);
  static const navyDeep = Color(0xFF071A33);
  static const navySoft = Color(0xFF163A5F);
  static const gold = Color(0xFFC99612);
  static const goldSoft = Color(0xFFF7E7B0);
  static const sand = Color(0xFFEEF2F7);
  static const mist = Color(0xFFE2E8F0);
}

ThemeData buildSuccessTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: SuccessColors.navy,
    primary: SuccessColors.navy,
    secondary: SuccessColors.gold,
    surface: Colors.white,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme.copyWith(
      primary: SuccessColors.navy,
      secondary: SuccessColors.gold,
      onPrimary: Colors.white,
      onSecondary: SuccessColors.navyDeep,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: SuccessColors.sand,
    dividerColor: SuccessColors.mist,
    appBarTheme: const AppBarTheme(
      backgroundColor: SuccessColors.navy,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: SuccessColors.navy,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: SuccessColors.navy,
        side: const BorderSide(color: SuccessColors.mist),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: SuccessColors.mist),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: SuccessColors.mist),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: SuccessColors.navy, width: 1.5),
      ),
      labelStyle: const TextStyle(color: Colors.black54),
    ),
    listTileTheme: const ListTileThemeData(
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 2),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: SuccessColors.mist),
      ),
    ),
  );
}
