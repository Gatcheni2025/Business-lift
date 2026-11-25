import 'dart:convert';
import 'business_categories.dart';
import 'shopper_auth.dart';

/// Device-only draft of business contact fields. A draft is never a registration,
/// identity proof, consent record or an authoritative Google address selection.
class SellerRegistrationDraft {
  final String name, phone, category, businessType, legalType, companyName, companyNumber,
      unit, addressText;
  const SellerRegistrationDraft({
    this.name = '', this.phone = '', this.category = 'spaza',
    this.businessType = '',
    this.legalType = 'individual', this.companyName = '',
    this.companyNumber = '', this.unit = '', this.addressText = '',
  });

  bool get isEmpty => [name, phone, companyName, companyNumber, unit, addressText]
      .every((value) => value.trim().isEmpty);

  Map<String, Object> toJson() => {
    'name': name, 'phone': phone, 'category': category, 'businessType': businessType, 'legalType': legalType,
    'companyName': companyName, 'companyNumber': companyNumber, 'unit': unit,
    'addressText': addressText,
  };

  factory SellerRegistrationDraft.fromJson(Map<String, dynamic> data) {
    String field(String key, int max) {
      final value = data[key];
      if (value is! String || value.length > max) return '';
      return value;
    }
    final category = ['spaza', 'retail', 'wholesale'].contains(data['category'])
        ? data['category'] as String : 'spaza';
    final requestedType = field('businessType', 60);
    return SellerRegistrationDraft(
      name: field('name', 120), phone: field('phone', 25),
      category: category,
      businessType: teyzaTypeFor(requestedType)?.accountCategory == category
          ? requestedType : teyzaDefaultBusinessType(category),
      legalType: data['legalType'] == 'company' ? 'company' : 'individual',
      companyName: field('companyName', 160), companyNumber: field('companyNumber', 50),
      unit: field('unit', 80), addressText: field('addressText', 250),
    );
  }
}

class SellerRegistrationDraftStore {
  final SessionStore store;
  final DateTime Function() now;
  static const retention = Duration(days: 7);
  static final Map<String, Future<void>> _pending = {};

  SellerRegistrationDraftStore({SessionStore? store, DateTime Function()? now})
      : store = store ?? SecureSessionStore(), now = now ?? DateTime.now;

  String _key(String uid) {
    if (uid.isEmpty) throw ArgumentError.value(uid, 'uid');
    return 'teyza_registration_draft_v1_${base64Url.encode(utf8.encode(uid))}';
  }

  // Serialize saves, reads and removal, including across page instances, so a
  // slow autosave cannot recreate the draft after a successful registration.
  Future<T> _run<T>(String uid, Future<T> Function(String key) operation) {
    final key = _key(uid);
    final task = (_pending[key] ?? Future<void>.value()).then((_) => operation(key));
    final tail = task.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    _pending[key] = tail;
    tail.then((_) { if (identical(_pending[key], tail)) _pending.remove(key); });
    return task;
  }

  Future<SellerRegistrationDraft?> read(String uid) => _run(uid, (key) async {
    final raw = await store.read(key);
    if (raw == null) return null;
    try {
      final data = jsonDecode(raw);
      final stamp = now().millisecondsSinceEpoch;
      if (data is! Map<String, dynamic> || data['version'] != 1 ||
          data['ownerUid'] != uid || data['expiresAt'] is! int ||
          (data['expiresAt'] as int) <= stamp ||
          (data['expiresAt'] as int) > stamp + retention.inMilliseconds ||
          data['fields'] is! Map<String, dynamic>) {
        await store.delete(key);
        return null;
      }
      return SellerRegistrationDraft.fromJson(data['fields'] as Map<String, dynamic>);
    } on FormatException {
      await store.delete(key);
      return null;
    }
  });

  Future<void> save(String uid, SellerRegistrationDraft draft) => _run(uid, (key) async {
    if (draft.isEmpty) return store.delete(key);
    await store.write(key, jsonEncode({
      'version': 1, 'ownerUid': uid,
      'expiresAt': now().add(retention).millisecondsSinceEpoch,
      'fields': draft.toJson(),
    }));
  });

  Future<void> clear(String uid) => _run(uid, store.delete);
}
