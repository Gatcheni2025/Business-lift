const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/landing-auth.js', 'utf8')
  .replace(/^import .*?;\n/gm, '');

function fixture() {
  const listeners = new Map();
  const status = {hidden: true, textContent: '', classList: {toggle() {}}};
  const button = {disabled: false};
  const googleButton = {disabled: false, addEventListener(event, fn) {listeners.set('google', fn)}};
  const registerForm = {
    querySelector(selector) {return selector === '[type=submit]' ? button : status},
    addEventListener(event, fn) {listeners.set('register', fn)}
  };
  const loginForm = {
    querySelector(selector) {return selector === '[type=submit]' ? button : status},
    addEventListener(event, fn) {listeners.set('login', fn)}
  };
  const modal = {querySelector() {return registerForm}, classList: {add() {}, remove() {}}, setAttribute() {}};
  const storage = new Map();
  const auth = {currentUser: null};
  const navigations = [];
  const user = {uid: 'seller-1', email: 'seller@example.com', displayName: '', getIdToken: async () => 'id-token'};
  let createCount = 0, bootstrapCount = 0, failBootstrap = false, loginError = false, isNewUser = true;
  const document = {
    head: {insertAdjacentHTML() {}}, body: {insertAdjacentHTML() {}, classList: {add() {}, remove() {}}},
    getElementById(id) {return ({loginModal: modal, tzRegister: modal, tzRegisterForm: registerForm, premiumLogin: loginForm, googleLogin: googleButton})[id] || null},
    querySelectorAll() {return []}, addEventListener() {}
  };
  const sandbox = {
    document, auth, sessionStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    location: {search: '', assign: destination => navigations.push(destination)},
    URLSearchParams, FormData: class {get(key) {return ({firstName: 'Lucky', lastName: 'Ndlovu', email: user.email, password: 'secret123', businessName: 'Lucky Shop'})[key]}},
    GoogleAuthProvider: class {setCustomParameters() {}},
    createUserWithEmailAndPassword: async () => {createCount++; auth.currentUser = user; return {user}},
    signInWithEmailAndPassword: async () => {if (loginError) throw {code: 'auth/invalid-credential'}; return {user}},
    signInWithPopup: async () => ({user}), getAdditionalUserInfo: () => ({isNewUser}),
    updateProfile: async (account, details) => {account.displayName = details.displayName},
    fetch: async () => {bootstrapCount++; return {ok: !failBootstrap, json: async () => failBootstrap ? {ok: false, error: 'Try again'} : {ok: true}}},
    setTimeout: fn => fn()
  };
  vm.runInNewContext(source, sandbox);
  const submit = async name => {await listeners.get(name)({preventDefault() {}}); await Promise.resolve()};
  return {submit, listeners, registerForm, loginForm, googleButton, status, button, storage, navigations, auth, user,
    set failBootstrap(value) {failBootstrap = value}, set loginError(value) {loginError = value}, set isNewUser(value) {isNewUser = value},
    get createCount() {return createCount}, get bootstrapCount() {return bootstrapCount}};
}

(async () => {
  const registration = fixture();
  registration.failBootstrap = true;
  await registration.submit('register');
  assert.equal(registration.createCount, 1);
  assert.equal(registration.status.textContent, 'Try again');
  assert.equal(registration.button.disabled, false);
  assert.equal(registration.storage.get('teyzaPendingEnrollment'), registration.user.uid);
  registration.failBootstrap = false;
  await registration.submit('register');
  assert.equal(registration.createCount, 1, 'retry must use the newly created account');
  assert.equal(registration.bootstrapCount, 2);
  assert.deepEqual(registration.navigations, ['dashboard.html?onboarding=1']);

  const login = fixture();
  login.loginError = true;
  await login.submit('login');
  assert.equal(login.status.textContent, 'Incorrect email or password.');
  assert.equal(login.status.hidden, false);
  assert.equal(login.button.disabled, false);

  const google = fixture();
  google.isNewUser = false;
  await google.listeners.get('google')({currentTarget: google.googleButton});
  assert.deepEqual(google.navigations, ['dashboard.html'], 'returning Google users should continue to their workspace');
  console.log('PASS: enrollment retry, visible login error, returning Google account routing');
})().catch(error => {console.error(error); process.exitCode = 1});
