import 'package:flutter/material.dart';

/// Native version of the green TEYZA monogram supplied in teyza.co.za.zip.
/// No external image or font download is required.
class TeyzaBrand {
  static const Color dark = Color(0xFF122228);
  static const Color green = Color(0xFF0DA574);
  static const Color deepGreen = Color(0xFF087F5B);
  static const Color coral = Color(0xFFFF5238);
  static const Color background = Color(0xFFF4F7F9);
  static const Color ink = Color(0xFF111E22);
  static const Color muted = Color(0xFF6A7C83);
  static const Color border = Color(0xFFE3EBEF);
}

class TeyzaMark extends StatelessWidget {
  final double size;
  const TeyzaMark({super.key, this.size = 42});

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: CustomPaint(painter: const _TeyzaMarkPainter()),
  );
}

class _TeyzaMarkPainter extends CustomPainter {
  const _TeyzaMarkPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 512, size.height / 512);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(48, 48, 416, 416), const Radius.circular(110)),
      Paint()..color = TeyzaBrand.deepGreen);
    final letter = Path()
      ..moveTo(174, 160)
      ..lineTo(378, 160)
      ..lineTo(365, 218)
      ..lineTo(296, 218)
      ..lineTo(265, 359)
      ..lineTo(203, 359)
      ..lineTo(234, 218)
      ..lineTo(161, 218)
      ..close();
    canvas.drawPath(letter, Paint()..color = Colors.white);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class TeyzaSectionTitle extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  const TeyzaSectionTitle({
    super.key, required this.eyebrow, required this.title,
    this.actionLabel, this.onAction,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(18, 20, 18, 12),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(eyebrow.toUpperCase(), style: const TextStyle(
        color: TeyzaBrand.green, fontSize: 10, fontWeight: FontWeight.w900,
        letterSpacing: 1.6)),
      const SizedBox(height: 3),
      Row(children: [
        Expanded(child: Text(title, style: const TextStyle(
          fontWeight: FontWeight.w900, fontSize: 20, color: TeyzaBrand.ink))),
        if (actionLabel != null && onAction != null)
          TextButton(onPressed: onAction, child: Text(actionLabel!,
            style: const TextStyle(fontWeight: FontWeight.bold))),
      ]),
    ]),
  );
}
