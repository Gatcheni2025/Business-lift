const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

exports.publishProduct = functions.https.onCall(async (data, context) => {
  // SECURITY CHECK
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to publish products.",
    );
  }

  // Extract data sent from your frontend
  const {
    name,
    price,
    desc,
    imageUrl,
    channels,
    whatsappNumber,
  } = data;

  const results = {};

  // Secure keys from environment variables
  const META_TOKEN = process.env.META_ACCESS_TOKEN;
  const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
  const X_TOKEN = process.env.X_BEARER_TOKEN;

  // FACEBOOK PUBLISHING
  if (channels.includes("facebook")) {
    try {
      // Replace this with your real Facebook Page ID
      const fbPageId = "YOUR_PAGE_ID";

      const message =
        `🌟 New Product Alert: ${name} 🌟\n\n` +
        `Price: R ${price}\n\n${desc}`;

      const fbRes = await axios.post(
          `https://graph.facebook.com/v18.0/${fbPageId}/photos`,
          {
            url: imageUrl,
            caption: message,
            access_token: META_TOKEN,
          },
      );

      results.facebook = {
        status: "success",
        id: fbRes.data.id,
      };
    } catch (error) {
      console.error(
          "Facebook Error:",
          (error.response && error.response.data) || error.message,
      );

      results.facebook = {
        status: "error",
        message: "Failed to post to Facebook",
      };
    }
  }

  // WHATSAPP PUBLISHING
  if (channels.includes("whatsapp") && whatsappNumber) {
    try {
      const cleanNumber = whatsappNumber.replace(/\D/g, "");

      const waRes = await axios.post(
          `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: cleanNumber,
            type: "template",
            template: {
              name: "new_product_alert",
              language: {
                code: "en_US",
              },
              components: [
                {
                  type: "header",
                  parameters: [
                    {
                      type: "image",
                      image: {
                        link: imageUrl,
                      },
                    },
                  ],
                },
                {
                  type: "body",
                  parameters: [
                    {
                      type: "text",
                      text: name,
                    },
                    {
                      type: "text",
                      text: `R ${price}`,
                    },
                  ],
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${META_TOKEN}`,
            },
          },
      );

      results.whatsapp = {
        status: "success",
        id: waRes.data.messages[0].id,
      };
    } catch (error) {
      console.error(
          "WhatsApp Error:",
          (error.response && error.response.data) || error.message,
      );

      results.whatsapp = {
        status: "error",
        message: "Failed to send WhatsApp message",
      };
    }
  }

  // X / TWITTER PUBLISHING
  if (channels.includes("x")) {
    try {
      const tweetText =
        `Check out our new product: ${name} for R ${price}!\n\n` +
        `${desc}\n#BusinessLift`;

      const xRes = await axios.post(
          "https://api.twitter.com/2/tweets",
          {
            text: tweetText,
          },
          {
            headers: {
              Authorization: `Bearer ${X_TOKEN}`,
            },
          },
      );

      results.x = {
        status: "success",
        id: xRes.data.data.id,
      };
    } catch (error) {
      console.error(
          "X Error:",
          (error.response && error.response.data) || error.message,
      );

      results.x = {
        status: "error",
        message: "Failed to post to X",
      };
    }
  }

  // Return result to frontend
  return {
    status: "completed",
    results,
  };
});
