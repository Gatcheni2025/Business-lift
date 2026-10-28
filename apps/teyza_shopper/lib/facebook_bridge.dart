// Safe default: the Meta SDK is added by prepare_mobile_release.py only when
// the real Meta app ID AND client token are configured. Never use dummy IDs.
import 'facebook_identity.dart';
const facebookConfigured=false;
Future<FacebookIdentity?> requestFacebookIdentity(String hashedNonce) async =>
  throw StateError('Facebook sign-in is not configured');
Future<void> clearFacebookSession() async {}
