'use strict';
const crypto = require('node:crypto');
class MobileError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new MobileError(status, message); };
const text = (value, label, max, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
    fail(422, `Enter a valid ${label}.`);
  return value.trim();
};
const id = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(422, 'Invalid reference.');
  return value;
};
function seller(account, uid) {
  if (!account || account.uid !== uid || !['spaza', 'retail'].includes(account.category))
    fail(403, 'Register your shop with this account first.');
  return account;
}
function published(shop, uid) {
  if (!shop || shop.sellerUid !== uid || shop.status !== 'active')
    fail(409, 'This shop is not currently available on Teyza.');
  return shop;
}
function member(thread, uid) {
  if (!thread || ![thread.ownerUid, thread.shopperUid].includes(uid))
    fail(403, 'This conversation belongs to another account.');
  return thread;
}
function settings(input) {
  const out = {};
  for (const key of ['deliveryEnabled','pickupEnabled','cashback','cardPayments','liveChatEnabled']) {
    if (typeof input[key] !== 'boolean') fail(422, 'Choose your shop services.');
    out[key] = input[key];
  }
  for (const [key,max] of [['deliveryFeeCents',100000],['deliveryRadiusKm',100]]) {
    if (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > max) fail(422, 'Enter valid delivery details.');
    out[key] = input[key];
  }
  if (out.deliveryEnabled && out.deliveryRadiusKm < 1) fail(422, 'Set your delivery area in kilometres.');
  out.deliveryNotes = text(input.deliveryNotes || '', 'delivery notes', 300, false);
  if(input.cardPaymentFeePercent!==undefined&&input.cardPaymentFeePercent!==0)fail(422,'Card payments use the advertised price. A card-only surcharge cannot be added.');
  out.cardPaymentFeePercent=0;
  out.cashDiscountPercent=input.cashDiscountPercent??0;
  if(![0,10].includes(out.cashDiscountPercent))fail(422,'Choose no cash discount or a 10% cash discount.');
  return out;
}
function hours(input) {
  if (!Array.isArray(input) || input.length !== 7) fail(422, 'Set hours for all seven days.');
  return input.map(day => {
    if (!day || typeof day.closed !== 'boolean') fail(422, 'Choose open or closed for each day.');
    if (day.closed) return {closed:true,open:'08:00',close:'17:00'};
    for (const key of ['open','close']) if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(day[key] || '')) fail(422, 'Use valid opening and closing times.');
    if (day.open === day.close) fail(422, 'Choose different opening and closing times.');
    return {closed:false,open:day.open,close:day.close};
  });
}
function restock(input) {
  if (!Array.isArray(input) || input.length > 50) fail(422, 'A stock list can contain up to 50 items.');
  return input.map(row => ({name:text(row?.name,'item name',100),
    quantity:text(row?.quantity,'quantity or pack size',60)}));
}
function credit(input) {
  if (input.consent !== true) fail(422, 'Agree to be contacted about your enquiry.');
  if (!Number.isInteger(input.amountCents) || input.amountCents < 10000 || input.amountCents > 50000000)
    fail(422, 'Enter an amount from R100 to R500,000.');
  return {amountCents:input.amountCents,purpose:text(input.purpose,'funding purpose',500),
    phone:text(input.phone,'contact number',25),status:'enquiry_received',consent:true};
}
const threadId = (owner, shopper) => crypto.createHash('sha256').update(JSON.stringify([owner,shopper])).digest('hex');
function orderItems(rows, products) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 40) fail(422, 'Choose up to 40 products.');
  const seen = new Set();
  return rows.map(row => {
    const productId = id(row?.id);
    if (seen.has(productId)) fail(422, 'Duplicate product.');
    seen.add(productId);
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 99) fail(422, 'Choose a valid quantity.');
    const p = products.find(product => product.id === productId);
    if (!p || !Number.isInteger(p.priceCents) || p.priceCents <= 0 || !Number.isInteger(p.stock) || p.stock < row.quantity)
      fail(409, 'A product or its available stock changed. Refresh the shop and try again.');
    return {id:productId,name:text(p.name,'product name',120),quantity:row.quantity,priceCents:p.priceCents};
  });
}
function transition(order, next, isOwner) {
  const allowed = {requested:['confirmed','cancelled'],confirmed:['preparing','cancelled'],
    preparing:order.mode === 'delivery'?['out_for_delivery','cancelled']:['ready','cancelled'],
    ready:['completed','cancelled'],out_for_delivery:['completed'],completed:[],cancelled:[]};
  if (!isOwner && !(order.status === 'requested' && next === 'cancelled')) fail(403, 'Only the shop can update this order.');
  if (!(allowed[order.status] || []).includes(next)) fail(409, 'This order has changed. Refresh before updating.');
  return next;
}
function imageBytes(value) {
  if (typeof value !== 'string' || value.length > 3000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(422, 'Choose a photo smaller than 2 MB.');
  const bytes = Buffer.from(value,'base64');
  if (bytes.length < 100 || bytes.length > 2000000 ||
    !(bytes.subarray(0,3).equals(Buffer.from([255,216,255])) || bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))
    fail(422, 'Choose a valid JPEG or PNG photo.');
  return bytes;
}
module.exports = {MobileError,fail,text,id,seller,published,member,settings,hours,restock,credit,threadId,orderItems,transition,imageBytes};
