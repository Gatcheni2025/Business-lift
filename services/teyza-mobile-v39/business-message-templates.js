'use strict';
const categoryBenefits={
 spaza:['Showcase eligible products, manage prices and stock, and receive supported customer orders.','Discover participating wholesalers, explore trade prices and source stock for your spaza shop.','Explore discounted delivery opportunities where available through participating partners.'],
 retail:['Showcase eligible products, manage prices and stock, and receive supported customer orders.','Explore participating wholesale suppliers and eligible trade offers where available to your business.','Explore discounted delivery opportunities where available through participating partners.'],
 wholesale:['Showcase eligible bulk products, quantities and trade prices to approved participating spaza buyers.','Connect with eligible spaza shops and retailers looking for stock, subject to participating buyer access.','Explore partner delivery options and available savings, subject to terms.'],
 food:['Showcase your food business and available products; receive supported orders where eligible selling tools are enabled.','Explore eligible supplier connections and sourcing opportunities where available.','Explore discounted delivery opportunities where available through participating partners.'],
 salon:['Showcase your salon, its location and available services so nearby customers can discover you.','Receive customer enquiries through supported communication features where available.','Explore eligible business and partner offers as they become available.'],
 service:['Showcase your business location and available services; help local customers discover your business.','Receive enquiries through supported communication features where available.','Explore eligible business and partner offers as they become available.'],
 manufacturer:['Showcase eligible products and business information to potential customers and trade partners.','Explore connections with participating retailers and eligible trade buyers where supported.','Explore partner delivery options and available savings, subject to terms.'],
 other:['Showcase your products or services with eligible business tools.','Explore relevant participating suppliers and business connections where available.','Explore available partner offers and delivery opportunities, subject to eligibility and terms.']
};
const oneLine=v=>String(v??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
function emailText(kind,p){
 const name=oneLine(p.name)||'Business',area=oneLine(p.area),city=oneLine(p.city);
 if(kind==='welcome')return {
  subject:'Welcome to Teyza – '+name,
  body:['Dear '+name+' Team,','Welcome to Teyza! Thank you for registering '+name+' with us.','Please complete any outstanding profile and verification steps in your own account. Once approved and eligible, your business can become discoverable to customers in your area.','Open the Teyza app and sign in to your own business account. For official download links, a guided app preview and help getting started, visit https://teyza.co.za/for-shop-owners.html.','Our Business Onboarding & Support Team can guide you through your profile, verification and using the platform. Never share your password or verification codes.','Reply to this email or contact support@teyza.co.za / 031 566 1165 whenever you need assistance.','Kind regards,\nTeyza Business Onboarding & Support Team\nTEYZA SA (PTY) LTD\nsupport@teyza.co.za | 031 566 1165\nhttps://teyza.co.za'].join('\n\n')
 };
 if(kind==='membership')return {subject:name+' – Grow with Teyza seller membership',body:['Dear '+name+' Team,','Thank you for registering your business on Teyza. Your approved, eligible business can be discovered through free listing.','Optional seller membership provides eligible product catalogues, stock and price management and supported customer orders. Explore participating suppliers and available delivery opportunities where eligible. The standard full-month membership is R99, subject to the current terms. Sales and savings are not guaranteed.','See current membership terms at https://teyza.co.za/seller-subscriptions.html. Our team can assist you with getting started; reply to this email.','Kind regards,\nTeyza Business Onboarding Team\nsupport@teyza.co.za\nhttps://teyza.co.za','Reply STOP if you prefer not to receive further marketing emails.'].join('\n\n')};
 if(kind!=='invitation')throw Error('Unknown email template.');
 const category=Object.hasOwn(categoryBenefits,p.category)?p.category:'other';
 const [selling,sourcing,savings]=categoryBenefits[category];
 const location=[area,city].filter((s,i,a)=>s&&a.indexOf(s)===i).join(', ');
 return {
  subject:name+' – Grow your business with Teyza',
  body:[
   'Dear '+name+' Team,',
   'We would like to personally invite '+name+' to showcase your business on Teyza — a South African digital marketplace connecting local businesses with customers, wholesalers and service providers.',
   'Our aim is to help businesses'+(location?' in '+location:' like yours')+' grow, reach more customers, access new business opportunities and operate more efficiently through one convenient mobile application.',
   'What are the benefits for '+name+'?',
   [
    '• Greater business exposure: Make your approved, eligible business easier to discover by potential customers in your area.',
    '• '+(['salon','service'].includes(category)?'Showcase your services':category==='wholesale'?'Sell to eligible trade buyers':'Sell directly through the app where eligible')+': '+selling,
    '• '+(['salon','service'].includes(category)?'Customer enquiries':'Connect with suppliers and trade partners')+': '+sourcing,
    '• '+(['salon','service'].includes(category)?'Explore partner opportunities':'Explore available savings')+': '+savings,
    '• Promote your business: Showcase relevant products, services and special offers with eligible features.',
    '• Dedicated business support: Receive assistance from the Teyza team whenever you need help getting started or using the platform.'
   ].join('\n'),
   'Getting started is free!\nThere is no charge to register and verify your business. Additional selling and promotional features are optional and subject to eligibility and applicable terms. Sales, discounts and delivery savings are not guaranteed.',
   'See how your business could look on the Teyza app:\nhttps://teyza.co.za/for-shop-owners.html',
   'Our team would be delighted to personally assist '+name+' with getting started and making the most of the opportunities available through Teyza. Simply reply to this email or contact our Business Onboarding Team.',
   'We look forward to growing together.',
   'Kind regards,\nTeyza Business Onboarding Team\nTEYZA SA (PTY) LTD\nTel: 031 566 1165\nEmail: support@teyza.co.za\nWebsite: https://teyza.co.za',
   'Supporting local businesses. Connecting communities.',
   'Reply STOP if you prefer not to receive further marketing emails.'
  ].join('\n\n')
 };
}

const whatsappBodies=Object.freeze({
 invitation:'Good day {{1}} Team. We invite you to showcase your business on Teyza. Register and verify for free, reach nearby customers, access eligible selling tools and explore participating suppliers and available delivery savings. Learn more: https://teyza.co.za/for-shop-owners.html. Reply for help or STOP to opt out of marketing.',
 welcome:'Welcome to Teyza, {{1}} Team. Thank you for registering. Complete any outstanding verification in your own app account. Our team can help you get started: https://teyza.co.za/for-shop-owners.html. Reply for support.',
 membership:'Good day {{1}} Team. Thank you for registering on Teyza. Optional seller membership unlocks eligible selling features. Standard full-month membership is R99, subject to current terms: https://teyza.co.za/seller-subscriptions.html. Reply for help or STOP to opt out of marketing.'
});
function whatsappText(kind,p){return whatsappBodies[kind]?.replace('{{1}}',()=>oneLine(p.name)||'Business')||'';}

module.exports={emailText,whatsappText,whatsappBodies};
