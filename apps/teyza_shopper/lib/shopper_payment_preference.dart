import 'shopper_auth.dart';

/// A locally encrypted UID-bound payment preference. Teyza does not accept or
/// store card numbers, CVVs, or payment tokens in the mobile app.
class ShopperPaymentPreferenceStore {
  ShopperPaymentPreferenceStore({SessionStore? vault})
      : _vault=vault??SecureSessionStore();
  final SessionStore _vault;
  static const cash='cash',cardAtShop='card_at_shop',cardOnline='card_online';
  static const choices=[cash,cardAtShop,cardOnline];
  String _key(String uid)=>'teyza_shopper_payment_preference_'+uid;
  Future<String> load(String uid) async {
    final value=await _vault.read(_key(uid));
    return choices.contains(value)?value!:cash;
  }
  Future<void> save(String uid,String preference) async {
    if(!choices.contains(preference))throw ArgumentError.value(preference,'preference');
    await _vault.write(_key(uid),preference);
  }
  Future<void> clear(String uid)=>_vault.delete(_key(uid));
  static String label(String preference)=>preference==cardOnline?
    'Online card via Paystack (seller approval required)':preference==cardAtShop?
    'Card at the shop (collection only)':'Cash on delivery / collection';
}
