import 'package:flutter/material.dart';

/// Shared, accessible surfaces for Teyza's shopper and business workspaces.
/// Keep the actual brand artwork and merchant photography as the visual focus.
abstract final class TeyzaDesign {
  static const ivory = Color(0xFFF7F8F5);
  static const forest = Color(0xFF073F35);
  static const mint = Color(0xFF60D5A5);
  static const ink = Color(0xFF183C34);
  static const muted = Color(0xFF5D7166);
  static const border = Color(0xFFE3E9E2);
  static const softMint = Color(0xFFEAF3EC);

  static ThemeData theme() => ThemeData(
        useMaterial3: true,
        fontFamily: 'PT Sans',
        scaffoldBackgroundColor: ivory,
        colorScheme: ColorScheme.fromSeed(
          seedColor: forest,
          primary: forest,
          onPrimary: Colors.white,
          secondary: mint,
          onSecondary: forest,
          surface: Colors.white,
          onSurface: ink,
          outlineVariant: border,
        ),
        textTheme: const TextTheme(
          headlineLarge: TextStyle(
              color: ink,
              fontSize: 32,
              fontWeight: FontWeight.w700,
              height: 1.12),
          headlineSmall: TextStyle(
              color: ink,
              fontSize: 26,
              fontWeight: FontWeight.w700,
              height: 1.15),
          titleLarge: TextStyle(
              color: ink,
              fontSize: 22,
              fontWeight: FontWeight.w700,
              height: 1.2),
          titleMedium:
              TextStyle(color: ink, fontSize: 17, fontWeight: FontWeight.w700),
          bodyLarge: TextStyle(color: ink, fontSize: 16, height: 1.4),
          bodyMedium: TextStyle(color: ink, fontSize: 14, height: 1.4),
          bodySmall: TextStyle(color: muted, fontSize: 12, height: 1.4),
        ),
        appBarTheme: const AppBarTheme(
            backgroundColor: ivory,
            foregroundColor: ink,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            centerTitle: false),
        dividerTheme:
            const DividerThemeData(color: border, thickness: 1, space: 1),
        listTileTheme: const ListTileThemeData(
            iconColor: forest,
            textColor: ink,
            contentPadding: EdgeInsets.symmetric(horizontal: 18, vertical: 4)),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: border)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: border)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: forest, width: 1.5)),
        ),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
          backgroundColor: forest,
          foregroundColor: Colors.white,
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: const TextStyle(
              fontFamily: 'PT Sans', fontSize: 15, fontWeight: FontWeight.w700),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        )),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
          foregroundColor: forest,
          minimumSize: const Size(48, 48),
          side: const BorderSide(color: border),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        )),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: forest,
          contentTextStyle: const TextStyle(
              fontFamily: 'PT Sans', color: Colors.white, fontSize: 14),
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      );
}
