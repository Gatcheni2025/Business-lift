# Teyza web sign-in provider setup

The landing page uses Firebase Authentication for email/password, Google, Facebook and Apple. Code changes alone cannot activate Facebook or Apple; complete these settings in the existing Firebase project `business-lift-3c19c`.

1. In Firebase Authentication, enable the Facebook provider. Enter the Facebook app ID and app secret from the Meta developer app. In Meta Facebook Login settings, allow the Firebase OAuth redirect URI shown in the Firebase provider configuration. For this project it should be `https://business-lift-3c19c.firebaseapp.com/__/auth/handler`. Add the production website domain to the Meta app, and complete Meta's requirements to make the app available to real users.
2. In Apple Developer, create a Services ID for web sign-in and configure the Firebase auth domain `business-lift-3c19c.firebaseapp.com` with the return URL `https://business-lift-3c19c.firebaseapp.com/__/auth/handler`. Create an Apple Sign in with Apple key. In Firebase Authentication, enable Apple and enter the Services ID, Team ID, Key ID and private key. Configure Apple's private email relay if the app emails users who choose Hide My Email.
3. In Firebase Authentication authorized domains, include `teyza.co.za` (and `www.teyza.co.za` only if that host serves the site). Keep provider secrets in their consoles, never in this repository.
4. Test each provider on the deployed HTTPS site with a new account and a returning account. Test cancellation, blocked popups and an email already associated with a different provider. Firebase may require that user to sign in with the original method; the landing page gives a clear message and does not automatically merge accounts.

The PHP workspace bootstrap continues to use the Firebase ID token for every sign-in method. Deploy the landing page, styles and script together.
