import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {auth} from './firebase-config.js';

const node = document.getElementById('shopper-publish-status');
const button = document.getElementById('shopper-publish');
const disable = document.getElementById('shopper-unpublish');
const whatsapp = document.getElementById('shopper-whatsapp');
let user = null;
function status(message, error = false) {
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
  node.className = 'alert' + (error ? ' error' : '');
}
async function call(method, payload) {
  if (!user) throw new Error('Sign in to your shop.');
  const token = await user.getIdToken();
  const response = await fetch('api/shopper-settings.php', {
    method, cache: 'no-store',
    headers: {'Authorization': 'Bearer ' + token, ...(payload ? {'Content-Type': 'application/json'} : {})},
    ...(payload ? {body: JSON.stringify(payload)} : {})
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'Shopper publishing is unavailable (HTTP ' + response.status + ').');
  return data;
}
onAuthStateChanged(auth, async (signedIn) => {
  user = signedIn;
  if (!button || !disable) return;
  if (!user) {
    button.disabled = true; disable.disabled = true;
    status('Log in to manage your shopper app listing.');
    return;
  }
  try {
    const data = await call('GET');
    button.disabled = !data.approved;
    disable.disabled = !data.shopperEnabled;
    whatsapp.checked = !!data.shopperWhatsAppOptIn;
    status(data.shopperEnabled ?
      'Your shop is visible to Teyza shoppers. ' + data.productsVisible + ' stocked products are currently listed.' :
      data.approved ? 'Your shop is approved. Publish your products so shoppers can find you.' :
      'Your shop must first be approved by Teyza before it can appear in the shopper app.');
  } catch (err) {
    button.disabled = true; disable.disabled = true;
    status(err.message, true);
  }
});
button?.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const data = await call('POST', {
      shopperEnabled: true,
      shopperWhatsAppOptIn: whatsapp.checked
    });
    disable.disabled = false;
    status('Published! ' + data.publishedProducts + ' product listings are ready for Teyza Shopper. Please refresh the app.');
  } catch (err) { status(err.message, true); }
  finally { button.disabled = false; }
});
disable?.addEventListener('click', async () => {
  disable.disabled = true;
  try {
    await call('POST', {shopperEnabled: false, shopperWhatsAppOptIn: false});
    status('Your shop has been removed from the public shopper catalogue.');
  } catch (err) { status(err.message, true); disable.disabled = false; }
});
