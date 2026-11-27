import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

const teyzaGreen = Color(0xFF087E61);
String zar(int cents) => 'R ' + (cents / 100).toStringAsFixed(2);
int randCents(String value) {
  final parts = value.trim().replaceAll(',', '.').split('.');
  if (parts.isEmpty || parts.length > 2 || !RegExp(r'^\d+$').hasMatch(parts[0]) ||
      (parts.length == 2 && !RegExp(r'^\d{1,2}$').hasMatch(parts[1]))) {
    throw const FormatException('Enter an amount in Rand (for example, 12.50).');
  }
  return int.parse(parts[0]) * 100 +
      (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
}
String marketError(Object e) {
  if (e is FirebaseFunctionsException) return e.message ?? e.code;
  if (e is FirebaseAuthException) return e.message ?? e.code;
  return e.toString();
}
Future<dynamic> marketCall(String function, Map<String, dynamic> data) async {
  final response = await FirebaseFunctions.instance.httpsCallable(function).call(data);
  return response.data;
}
Future<void> showLogin(BuildContext context) async {
  final email = TextEditingController();
  final password = TextEditingController();
  bool createAccount = false;
  bool busy = false;
  try {
    await showModalBottomSheet<void>(
      context: context, isScrollControlled: true, showDragHandle: true,
      builder: (sheet) => StatefulBuilder(builder: (sheet, update) {
        final user = FirebaseAuth.instance.currentUser;
        return Padding(
          padding: EdgeInsets.fromLTRB(18, 8, 18, MediaQuery.viewInsetsOf(sheet).bottom + 28),
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(user != null ? 'My Teyza account' :
              createAccount ? 'Create an account' : 'Sign in to Teyza',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 14),
            if (user != null) ...[
              Text(user.email ?? 'Signed in'),
              TextButton(onPressed: () async {
                await FirebaseAuth.instance.signOut();
                if (sheet.mounted) Navigator.pop(sheet);
              }, child: const Text('Sign out')),
            ] else ...[
              TextField(controller: email, keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email')),
              const SizedBox(height: 10),
              TextField(controller: password, obscureText: true,
                decoration: const InputDecoration(labelText: 'Password')),
              const SizedBox(height: 14),
              FilledButton(onPressed: busy ? null : () async {
                update(() => busy = true);
                try {
                  if (createAccount) {
                    await FirebaseAuth.instance.createUserWithEmailAndPassword(
                      email: email.text.trim(), password: password.text);
                  } else {
                    await FirebaseAuth.instance.signInWithEmailAndPassword(
                      email: email.text.trim(), password: password.text);
                  }
                  if (sheet.mounted) Navigator.pop(sheet);
                } catch (e) {
                  if (sheet.mounted) ScaffoldMessenger.of(sheet).showSnackBar(
                    SnackBar(content: Text(marketError(e))));
                } finally {
                  if (sheet.mounted) update(() => busy = false);
                }
              }, child: Text(busy ? 'Signing in…' : createAccount ? 'Create account' : 'Sign in')),
              TextButton(onPressed: () => update(() => createAccount = !createAccount),
                child: Text(createAccount ? 'Already registered? Sign in' : 'New user? Create account')),
            ],
          ]),
        );
      }),
    );
  } finally {
    email.dispose(); password.dispose();
  }
}
