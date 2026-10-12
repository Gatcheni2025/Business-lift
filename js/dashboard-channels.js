import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
  auth
} from "./firebase-config.js";

import {
  getBusinessContext
} from "./business-context.js";

const FUNCTIONS_BASE_URL =
  "https://us-central1-business-lift-3c19c.cloudfunctions.net";

async function getConnections(
  user,
  businessId
) {
  const token =
    await user.getIdToken();

  const response =
    await fetch(
      `${FUNCTIONS_BASE_URL}/getChannelConnections`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            businessId
          }
        }),
      }
    );

  const body =
    await response
      .json()
      .catch(() => ({}));

  if (
    !response.ok ||
    body.error
  ) {
    throw new Error(
      body?.error?.message ||
      "Unable to load selling channels."
    );
  }

  return (
    body.data ??
    body.result ??
    body ??
    {}
  );
}

function setState(
  channel,
  connected,
  text
) {
  const link =
    document.querySelector(
      `[data-dashboard-channel="${channel}"]`
    );

  const status =
    document.querySelector(
      `[data-dashboard-channel-status="${channel}"]`
    );

  if (!link) return;

  link.classList.toggle(
    "is-connected",
    connected
  );

  link.classList.toggle(
    "is-not-connected",
    !connected
  );

  link.dataset.channelState =
    connected ?
      "connected" :
      "not-connected";

  if (status) {
    status.textContent =
      text ||
      (connected ?
        "Connected" :
        "Connect");
  }
}

function render(state = {}) {
  const meta =
    state.meta || {};

  const google =
    state.google || {};

  const whatsapp =
    state.whatsapp || {};

  const x =
    state.x || {};

  const youtube =
    state.youtube || {};

  const tiktok =
    state.tiktok || {};

  setState(
    "teyza",
    true,
    "Included"
  );

  setState(
    "facebook",
    Boolean(meta.connected),
    meta.connected ?
      "Connected" :
      "Connect"
  );

  const instagramConnected =
    Boolean(
      meta.connected &&
      meta.instagramBusinessId
    );

  setState(
    "instagram",
    instagramConnected,
    instagramConnected ?
      "Connected" :
      "Connect"
  );

  setState(
    "whatsapp",
    Boolean(whatsapp.connected),
    whatsapp.connected ?
      "Connected" :
      "Connect"
  );

  setState(
    "google",
    Boolean(google.connected),
    google.connected ?
      "Connected" :
      "Connect"
  );

  setState(
    "x",
    Boolean(x.connected),
    x.connected ?
      "Connected" :
      "Connect"
  );

  setState(
    "youtube",
    Boolean(youtube.connected),
    youtube.connected ?
      "Connected" :
      "Connect"
  );

  setState(
    "tiktok",
    Boolean(tiktok.connected),
    tiktok.connected ?
      "Connected" :
      "Connect"
  );
}

onAuthStateChanged(
  auth,
  async (user) => {
    if (!user) return;

    try {
      const context =
        await getBusinessContext(user);

      const businessId =
        String(
          context.businessId ||
          user.uid
        );

      const state =
        await getConnections(
          user,
          businessId
        );

      render(state);
    } catch (error) {
      console.warn(
        "Unable to load dashboard channel status:",
        error
      );

      [
        "facebook",
        "instagram",
        "whatsapp",
        "google",
        "x",
        "youtube",
        "tiktok",
      ].forEach((channel) => {
        setState(
          channel,
          false,
          "Manage"
        );
      });
    }
  }
);
