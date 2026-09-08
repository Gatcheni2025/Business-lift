const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const axios = require('axios');

admin.initializeApp();

// ============================================================================
// THE BUSINESS EXPOSE ENGINE: ACTUAL API INTEGRATIONS
// ============================================================================

exports.exposeToNetwork = functions.https.onCall(async (data, context) => {
    // Ensure the user is logged in
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to Expose products.');
    }

    const { productName, price, imageUrl, description, channels } = data;
    let results = { google: null, meta: null, whatsapp: null };

    // 1. PUBLISH TO GOOGLE MERCHANT CENTER (REAL API LOGIC)
    if (channels.includes('google')) {
        try {
            // NOTE: You must set up a Google Service Account in Google Cloud Console
            // and add the credentials to Firebase config: firebase functions:config:set google.client_email="..."
            const auth = new google.auth.GoogleAuth({
                scopes: ['https://www.googleapis.com/auth/content']
            });
            const content = google.content({ version: 'v2.1', auth });
            
            const merchantId = functions.config().google.merchant_id; // Your Google Merchant ID
            
            const response = await content.products.insert({
                merchantId: merchantId,
                requestBody: {
                    offerId: `BE-${Date.now()}`,
                    title: productName,
                    description: description || "Exposed via Business Expose",
                    link: "https://yourwebsite.co.za/product", // Where client buys it
                    imageLink: imageUrl,
                    contentLanguage: 'en',
                    targetCountry: 'ZA',
                    channel: 'online',
                    availability: 'in stock',
                    condition: 'new',
                    price: { value: price, currency: 'ZAR' }
                }
            });
            results.google = { status: 'success', id: response.data.id };
        } catch (error) {
            console.error("Google API Error:", error.message);
            results.google = { status: 'error', message: error.message };
        }
    }

    // 2. PUBLISH TO META (FACEBOOK / INSTAGRAM CATALOG)
    if (channels.includes('meta')) {
        try {
            // Requires a Facebook Business Manager Catalog ID and System User Access Token
            const catalogId = functions.config().meta.catalog_id;
            const accessToken = functions.config().meta.access_token;

            const response = await axios.post(`https://graph.facebook.com/v18.0/${catalogId}/products`, {
                name: productName,
                description: description || "Exposed via Business Expose",
                price: price * 100, // Meta requires cents
                currency: 'ZAR',
                url: "https://yourwebsite.co.za/product",
                image_url: imageUrl,
                brand: "Gatcheni Stores",
                availability: "in stock",
                condition: "new"
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            results.meta = { status: 'success', id: response.data.id };
        } catch (error) {
            console.error("Meta API Error:", error.response?.data || error.message);
            results.meta = { status: 'error', message: error.message };
        }
    }

    // Save the exposed product to your own Firebase Database
    await admin.firestore().collection('exposed_products').add({
        userId: context.auth.uid,
        productName,
        price,
        imageUrl,
        syndicationResults: results,
        exposedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { message: "Product successfully exposed globally!", results };
});