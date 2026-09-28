# Teyza web sign-in provider setup

The landing page uses Firebase Authentication for email/password, Google, Facebook and Apple. Code changes alone cannot activate providers; complete these settings in the existing Firebase project `business-lift-3c19c`.

0. In Firebase Authentication → Sign-in method, enable Email/Password (the Email/Password switch, not email-link only). Add both `teyza.co.za` and `business-lift.vercel.app` under Authorized domains. Create a fresh email account through Teyza's Create account form, then sign out and sign in with its password. An account first created with Google does not automatically gain an email/password credential. Use Google for that account unless you explicitly link an email/password credential. Check the password reset flow with an email/password account.

1. In Firebase Authentication, enable the Facebook provider. Enter the Facebook app ID and app secret from the Meta developer app. In Meta Facebook Login settings, allow the Firebase OAuth redirect URI shown in the Firebase provider configuration. For this project it should be `https://business-lift-3c19c.firebaseapp.com/__/auth/handler`. Add the production website domain to the Meta app, and complete Meta's requirements to make the app available to real users.
2. In Apple Developer, create a Services ID for web sign-in and configure the Firebase auth domain `business-lift-3c19c.firebaseapp.com` with the return URL `https://business-lift-3c19c.firebaseapp.com/__/auth/handler`. Create an Apple Sign in with Apple key. In Firebase Authentication, enable Apple and enter the Services ID, Team ID, Key ID and private key. Configure Apple's private email relay if the app emails users who choose Hide My Email.
3. In Firebase Authentication authorized domains, include `business-lift.vercel.app`. Add `teyza.co.za` too if that host serves the site. Configure the website origin in the Meta and Apple app settings as required by those providers. Keep provider secrets in their consoles, never in this repository.
4. Test each provider on the deployed HTTPS site with a new account and a returning account. Test cancellation, blocked popups and an email already associated with a different provider. Firebase may require that user to sign in with the original method; the landing page gives a clear message and does not automatically merge accounts.

## Phone verification for seller enrollment

- Enable **Phone** in Firebase Authentication → Sign-in method. In Authentication → Settings → SMS region policy, allow South Africa (+27). Add `teyza.co.za` and `business-lift.vercel.app` to Authorized domains.
- Firebase requires the project to be linked to a Cloud Billing account to send real verification SMS. Check the SMS quota and delivery reports if a code is not received. Use a Firebase fictional test phone number and code for a controlled integration test; do not disable app verification for real numbers.
- The profile now shows a visible reCAPTCHA and a specific Firebase error when the code cannot be sent. The phone must be linked to the same Firebase account as the seller. A number already linked to another account cannot be silently claimed.

The PHP workspace bootstrap continues to use the Firebase ID token for every sign-in method. The static Vercel deployment needs a running PHP API behind `/api/workspace.php` and persistent storage for the workspace data. Deploy the landing page, styles and script together, then connect and verify that backend before considering enrollment and login complete.
