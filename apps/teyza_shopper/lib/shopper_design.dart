import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Shared, accessible surfaces for Teyza's shopper and business workspaces.
/// Keep the actual brand artwork and merchant photography as the visual focus.
abstract final class TeyzaDesign {
  // Logo-led marketplace palette. Dark teal and dark green provide readable
  // text/action contrast; lime and golden orange are brand accents, not statuses.
  static const ivory = Color(0xFFF7F8F5);
  static const forest = Color(0xFF00545B);
  static const deepTeal = Color(0xFF003A46);
  static const teal = Color(0xFF087780);
  static const leaf = Color(0xFF18751E);
  static const lime = Color(0xFF79D91B);
  static const orange = Color(0xFFFF8C12);
  static const gold = Color(0xFFFFC63A);
  static const mint = Color(0xFFB6F0B6);
  static const ink = Color(0xFF10333A);
  static const muted = Color(0xFF536D70);
  static const border = Color(0xFFDDE8E5);
  static const softMint = Color(0xFFEAF7E8);
  static const softOrange = Color(0xFFFFF0DA);

  static const brandGradient = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight,
    colors: [teal, deepTeal],
  );
  static const shopsGradient = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight,
    colors: [Color(0xFF218720), Color(0xFF0B6018)],
  );
  static const businessesGradient = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight,
    colors: [gold, orange],
  );

  static Color categoryAccent(String key) => switch (key) {
    'food' || 'Bakery' || 'Snacks' => const Color(0xFFB44D00),
    'manufacturing' || 'events' => const Color(0xFF7045AB),
    'beauty' || 'Personal Care' => const Color(0xFFAF347F),
    'home' || 'auto' || 'Drinks' || 'logistics' => const Color(0xFF1767A4),
    'retail' || 'spaza' || 'Fruit & Veg' || 'Pantry' => leaf,
    'professional' || 'wholesale' || 'Household' => const Color(0xFF9B6500),
    _ => forest,
  };

  static ThemeData theme() => ThemeData(
        useMaterial3: true,
        fontFamily: 'PT Sans',
        scaffoldBackgroundColor: ivory,
        colorScheme: ColorScheme.fromSeed(
          seedColor: forest,
          primary: forest,
          onPrimary: Colors.white,
          secondary: leaf,
          onSecondary: Colors.white,
          tertiary: orange,
          onTertiary: ink,
          surface: Colors.white,
          onSurface: ink,
          outlineVariant: border,
        ),
        textTheme: const TextTheme(
          headlineLarge: TextStyle(
              color: ink,
              fontSize: 32,
              fontWeight: FontWeight.w800,
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
        chipTheme: ChipThemeData(
          backgroundColor: Colors.white,
          selectedColor: softMint,
          secondarySelectedColor: softMint,
          checkmarkColor: leaf,
          side: const BorderSide(color: border),
          labelStyle: const TextStyle(color: ink, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
        ),
        progressIndicatorTheme: const ProgressIndicatorThemeData(color: leaf),
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

/// Always render the approved vector artwork, including the original leaf Y.
/// The light variant changes the letters to white, preserving the leaf colours.
class TeyzaWordmark extends StatelessWidget {
  final double width;
  final bool darkSurface;
  const TeyzaWordmark({super.key, this.width = 124, this.darkSurface = false});

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    darkSurface
      ? 'assets/brand/teyza-sprout-wordmark-light.svg'
      : 'assets/brand/teyza-sprout-wordmark.svg',
    width: width, height: width * 370 / 1280,
    fit: BoxFit.contain, semanticsLabel: 'Teyza',
  );
}

/// Reusable brand surface. Decorative leaves sit behind the content, never
/// intercept input, and do not change the real dashboard/payment information.
class TeyzaBrandPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  const TeyzaBrandPanel({super.key, required this.child,
    this.padding = const EdgeInsets.all(18), this.radius = 24});

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(radius),
    child: DecoratedBox(
      decoration: const BoxDecoration(gradient: TeyzaDesign.brandGradient),
      child: Stack(children: [
        const Positioned.fill(child: IgnorePointer(
          child: CustomPaint(painter: _TeyzaLeafPainter()))),
        Padding(padding: padding, child: child),
      ]),
    ),
  );
}

class _TeyzaLeafPainter extends CustomPainter {
  const _TeyzaLeafPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    // The motif is restrained and confined to the corner to preserve contrast.
    final green = Path()
      ..moveTo(w, h * .04)
      ..quadraticBezierTo(w * .79, h * .13, w * .82, h * .51)
      ..quadraticBezierTo(w * .96, h * .42, w, h * .21)
      ..close();
    final orange = Path()
      ..moveTo(w, h * .33)
      ..quadraticBezierTo(w * .88, h * .42, w * .88, h * .82)
      ..quadraticBezierTo(w * .97, h * .72, w, h * .51)
      ..close();
    canvas.drawPath(green, Paint()..color = const Color(0x3979D91B));
    canvas.drawPath(orange, Paint()..color = const Color(0x39FFC63A));
  }
  @override
  bool shouldRepaint(covariant _TeyzaLeafPainter oldDelegate) => false;
}
