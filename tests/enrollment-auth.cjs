const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fullSource = fs.readFileSync('js/landing-auth.js', 'utf8');
const source = fullSource.slice(fullSource.indexOf('const google ='));

function fixture() {
  const listeners = new Map();
  const statuses = {login: {hidden: true}, register: {hidden: true}};
  const buttons = {login: {disabled: false}, register: {disabled: false}};
  const user = {uid: 'seller-1', email: 'seller@example.com', displayName: '', getIdToken: async () => 'id-token'};
  const auth = {currentUser: null};
  const navigations = [], storage = new Map(), providerCalls = [];
  let createCount = 0, bootstrapCount = 0, failBootstrap = false, loginError = false, providerError = null, isNewUser = true;
  const makeForm = mode => ({
    addEventListener(type, callback) {listeners.set(mode, callback)},
    querySelector() {return buttons[mode]}
  });
  const forms = {login: makeForm('login'), register: makeForm('register')};
  const makeModal = mode => ({
    querySelector(selector) {return selector === '[data-status]' ? statuses[mode] : {focus() {}}},
    classList: {add() {}, remove() {}}, setAttribute() {}
  });
  const modals = {login: makeModal('login'), register: makeModal('register')};
  const document = {
    body: {insertAdjacentHTML() {}, classList: {add() {}, remove() {}}},
    activeElement: null,
    getElementById(id) {return ({tzLogin: modals.login, tzRegister: modals.register, tzLoginForm: forms.login, tzRegisterForm: forms.register})[id]},
    querySelectorAll() {return []},
    addEventListener(type, callback) {listeners.set(type, callback)}
  };
  class Provider {
    constructor(id) {this.providerId = id; this.scopes = []}
    setCustomParameters() {}
    addScope(scope) {this.scopes.push(scope)}
  }
  const sandbox = {
    document, auth, location: {pathname: '/', search: '', assign: destination => navigations.push(destination)},
    sessionStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
    URLSearchParams,
    FormData: class {get(key) {return ({firstName: 'Lucky', lastName: 'Ndlovu', email: user.email, password: 'secret123', businessName: 'Lucky Shop'})[key]}},
    GoogleAuthProvider: class extends Provider {constructor() {super('google.com')}},
    FacebookAuthProvider: class extends Provider {constructor() {super('facebook.com')}},
    OAuthProvider: class extends Provider {},
    createUserWithEmailAndPassword: async () => {createCount++; auth.currentUser = user; return {user}},
    signInWithEmailAndPassword: async () => {if (loginError) throw {code: 'auth/invalid-credential'}; return {user}},
    signInWithPopup: async (_auth, provider) => {providerCalls.push(provider); if (providerError) throw {code: providerError}; return {user}},
    getAdditionalUserInfo: () => ({isNewUser}),
    updateProfile: async (account, details) => {account.displayName = details.displayName},
    fetch: async () => {bootstrapCount++; return {ok: !failBootstrap, json: async () => failBootstrap ? {ok: false, error: 'Try again'} : {ok: true}}}
  };
  vm.runInNewContext(source, sandbox);
  const submit = async mode => listeners.get(mode)({preventDefault() {}});
  const social = async (provider, mode = 'login') => {
    const button = {disabled: false, dataset: {provider, mode}, closest() {return modals[mode]}};
    listeners.get('click')({target: {closest(selector) {return selector === '[data-provider]' ? button : null}}});
    await new Promise(resolve => setImmediate(resolve));
    return button;
  };
  return {submit, social, statuses, buttons, storage, navigations, user, providerCalls,
    set failBootstrap(value) {failBootstrap = value}, set loginError(value) {loginError = value},
    set providerError(value) {providerError = value}, set isNewUser(value) {isNewUser = value},
    get createCount() {return createCount}, get bootstrapCount() {return bootstrapCount}};
}

(async () => {
  const registration = fixture();
  registration.failBootstrap = true;
  await registration.submit('register');
  assert.equal(registration.createCount, 1);
  assert.equal(registration.statuses.register.textContent, 'Try again');
  assert.equal(registration.buttons.register.disabled, false);
  assert.equal(registration.storage.get('teyzaPendingEnrollment'), registration.user.uid);
  registration.failBootstrap = false;
  await registration.submit('register');
  assert.equal(registration.createCount, 1, 'retry must reuse the newly created account');
  assert.equal(registration.bootstrapCount, 2);
  assert.deepEqual(registration.navigations, ['dashboard.html?onboarding=1']);

  const login = fixture();
  login.loginError = true;
  await login.submit('login');
  assert.match(login.statuses.login.textContent, /Incorrect email or password/);
  assert.equal(login.statuses.login.hidden, false);
  assert.equal(login.buttons.login.disabled, false);

  const google = fixture();
  google.isNewUser = false;
  await google.social('google');
  assert.equal(google.providerCalls[0].providerId, 'google.com');
  assert.deepEqual(google.navigations, ['dashboard.html']);

  const facebook = fixture();
  await facebook.social('facebook', 'register');
  assert.equal(facebook.providerCalls[0].providerId, 'facebook.com');
  assert(facebook.providerCalls[0].scopes.includes('email'));
  assert.deepEqual(facebook.navigations, ['dashboard.html?onboarding=1']);

  const apple = fixture();
  apple.providerError = 'auth/operation-not-allowed';
  const appleButton = await apple.social('apple');
  assert.equal(apple.providerCalls[0].providerId, 'apple.com');
  assert(apple.providerCalls[0].scopes.includes('name'));
  assert.match(apple.statuses.login.textContent, /Apple sign-in is not enabled/);
  assert.equal(appleButton.disabled, false);
  const appleReady = fixture();
  appleReady.isNewUser = false;
  await appleReady.social('apple');
  assert.deepEqual(appleReady.navigations, ['dashboard.html']);
  const collision = fixture();
  collision.providerError = 'auth/account-exists-with-different-credential';
  await collision.social('facebook');
  assert.match(collision.statuses.login.textContent, /another sign-in method/);
  assert.deepEqual(collision.navigations, []);
  console.log('PASS: enrollment retry, email login errors, Google/Facebook/Apple provider routing and setup error');
})().catch(error => {console.error(error); process.exitCode = 1});
