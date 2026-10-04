import {



  onAuthStateChanged



} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";







import {



  auth



} from "./firebase-config.js";







import {



  getBusinessContext,



  getWorkspaceSection,



  saveWorkspaceSection,



  workspaceError



} from "./business-context.js?v=2";











let currentUser = null;



let businessId = "";







let selectedPay = "eft";



let selectedGender = "all";

const selectedSellingChannels = new Set(["teyza"]);

const optionalSellingChannels = ["facebook", "instagram", "whatsapp", "google", "x", "youtube", "tiktok"];
const sellingChannelLabels = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp Business",
  google: "Google Shopping",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok"
};

function deferredSellingChannels() {
  return optionalSellingChannels.filter((channel) => !channelConnected(channel));
}

/* =========================================================
   SELLING CHANNEL BACKEND CONNECTIONS
========================================================= */

const FUNCTIONS_BASE_URL = "https://us-central1-business-lift-3c19c.cloudfunctions.net";
let sellingConnectionState = {};
let whatsappSession = null;
let whatsappCode = "";

async function callSocialFunction(name, payload = {}) {
  if (!currentUser) throw new Error("You must be signed in to connect a selling channel.");
  const token = await currentUser.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({data: payload})
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = new Error(body?.error?.message || `Connection failed with HTTP ${response.status}.`);
    error.code = body?.error?.status || body?.error?.code || `http-${response.status}`;
    error.details = body?.error?.details;
    throw error;
  }
  return {data: body.data ?? body.result ?? body};
}

function sellingNotice(message, tone = "info") {
  const note = $("sellingPlatformNote");
  if (note) {
    note.textContent = message;
    note.dataset.tone = tone;
  } else {
    console.log(message);
  }
}

function socialError(error, fallback = "Connection failed.") {
  const details = error?.details;
  return error?.message || (typeof details === "string" ? details : details?.message) || fallback;
}

function socialReturnPath() {
  return "/seller-onboarding.html?review=1&step=1";
}

async function startSocialOauth(provider, channel = provider) {
  const functionName =
    provider === "google" ? "getGoogleConnectUrl" :
    provider === "x" ? "getXConnectUrl" :
    provider === "youtube" ? "getYouTubeConnectUrl" :
    provider === "tiktok" ? "getTikTokConnectUrl" :
    "getSocialConnectUrl";
  const result = await callSocialFunction(functionName, {
    businessId,
    provider,
    channel,
    returnTo: socialReturnPath()
  });
  if (!result.data?.url) throw new Error("No connection URL returned by Teyza.");
  window.location.assign(result.data.url);
}

function loadFacebookSdk(appId, graphVersion) {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB.init({appId, cookie: true, xfbml: true, version: graphVersion});
      resolve(window.FB);
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const js = document.createElement("script");
    js.id = "facebook-jssdk";
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.async = true;
    js.defer = true;
    js.onerror = reject;
    document.head.appendChild(js);
  });
}

async function finishWhatsAppIfReady() {
  if (!whatsappCode || !whatsappSession?.waba_id || !whatsappSession?.phone_number_id) return;
  await callSocialFunction("completeWhatsAppEmbeddedSignup", {
    businessId,
    code: whatsappCode,
    wabaId: whatsappSession.waba_id,
    phoneNumberId: whatsappSession.phone_number_id
  });
  whatsappCode = "";
  whatsappSession = null;
  sellingNotice("WhatsApp Business connected successfully.", "success");
  await refreshSellingConnections();
}

async function startWhatsAppConnection() {
  const config = (await callSocialFunction("getWhatsAppEmbeddedSignupConfig", {businessId})).data || {};
  if (!config.appId) throw new Error("META_APP_ID is not configured in Firebase Functions.");
  if (!config.configId) throw new Error("WhatsApp Embedded Signup is not configured yet.");
  const FB = await loadFacebookSdk(config.appId, config.graphVersion || "v23.0");

  if (!window.__teyzaWhatsAppMessageListener) {
    window.__teyzaWhatsAppMessageListener = true;
    window.addEventListener("message", (event) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH") {
          whatsappSession = data.data || null;
          void finishWhatsAppIfReady().catch((error) => sellingNotice(socialError(error), "error"));
        } else if (data.event === "ERROR") {
          sellingNotice(String(data.data?.error_message || data.data?.error || "WhatsApp setup failed."), "error");
        } else if (data.event === "CANCEL") {
          sellingNotice("WhatsApp setup was cancelled.", "error");
        }
      } catch (error) {
        console.error("Unable to read WhatsApp signup event", error);
      }
    });
  }

  FB.login((response) => {
    whatsappCode = response?.authResponse?.code || response?.code || "";
    if (!whatsappCode) {
      sellingNotice("WhatsApp setup was cancelled or no authorization code was returned.", "error");
      return;
    }
    void finishWhatsAppIfReady().catch((error) => sellingNotice(socialError(error), "error"));
  }, {
    config_id: String(config.configId),
    response_type: "code",
    override_default_response_type: true,
    extras: {setup: {}, featureType: "", sessionInfoVersion: "3"}
  });
}

function channelConnected(channel) {
  const meta = sellingConnectionState.meta || {};
  if (channel === "facebook") return Boolean(meta.connected);
  if (channel === "instagram") return Boolean(meta.connected && meta.instagramBusinessId);
  return Boolean(sellingConnectionState[channel]?.connected);
}

function renderOnboardingChooser(channel) {
  const button = document.querySelector(`[data-sell-here="${channel}"]`);
  const card = button?.closest("[data-selling-channel]") || button?.parentElement;
  if (!card) return;
  card.querySelector("[data-onboarding-account-chooser]")?.remove();

  const state = channel === "facebook" || channel === "instagram"
    ? (sellingConnectionState.meta || {})
    : (sellingConnectionState.google || {});
  const items = channel === "google" ? state.availableAccounts : state.availablePages;
  if (!Array.isArray(items) || !items.length || channelConnected(channel)) return;

  const chooser = document.createElement("div");
  chooser.dataset.onboardingAccountChooser = channel;
  chooser.className = "onboarding-account-chooser";
  const title = document.createElement("strong");
  title.textContent = channel === "google" ? "Choose your Google Merchant account" : `Choose the Facebook Page for ${channel === "instagram" ? "Instagram" : "Facebook"}`;
  chooser.appendChild(title);

  items.forEach((item) => {
    if (channel === "instagram" && !item.instagramBusinessId) return;
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "btn secondary";
    choice.textContent = item.accountName || item.name || item.accountId || item.id;
    choice.addEventListener("click", async () => {
      try {
        choice.disabled = true;
        if (channel === "google") {
          await callSocialFunction("selectGoogleMerchantAccount", {businessId, accountId: item.accountId});
        } else {
          await callSocialFunction("selectMetaPage", {businessId, pageId: item.id});
        }
        await refreshSellingConnections();
        sellingNotice(`${channel[0].toUpperCase() + channel.slice(1)} connected successfully.`, "success");
      } catch (error) {
        choice.disabled = false;
        sellingNotice(socialError(error, "Unable to select this selling account."), "error");
      }
    });
    chooser.appendChild(choice);
  });
  card.appendChild(chooser);
}

function renderSellingConnections() {
  ["facebook", "instagram", "whatsapp", "google", "x", "youtube", "tiktok"].forEach((channel) => {
    const button = document.querySelector(`[data-sell-here="${channel}"]`);
    if (!button) return;
    const connected = channelConnected(channel);
    button.disabled = false;
    button.classList.toggle("is-selected", connected);
    button.setAttribute("aria-pressed", connected ? "true" : "false");
    button.textContent = connected ? "Connected ✓" : "Sell here";
    button.closest("[data-selling-channel]")?.classList.toggle("is-selected", connected);
    if (connected) selectedSellingChannels.add(channel);
    else selectedSellingChannels.delete(channel);

    if (["facebook", "instagram", "google"].includes(channel)) {
      renderOnboardingChooser(channel);
    }
  });

  const deferred = deferredSellingChannels();
  const setupLaterButton = $("setupSellingLater");
  if (setupLaterButton) {
    setupLaterButton.hidden = false;
    setupLaterButton.textContent = deferred.length ?
      `Set up ${deferred.length} channel${deferred.length === 1 ? "" : "s"} later` :
      "Continue with current channels";
  }

  updateSellingPlatformSummary();
}

async function refreshSellingConnections() {
  if (!businessId) return;
  const response = await callSocialFunction("getChannelConnections", {businessId});
  sellingConnectionState = response.data || {};
  renderSellingConnections();
}

async function connectSellingChannel(channel, button) {
  if (channelConnected(channel)) {
    sellingNotice(`${channel[0].toUpperCase() + channel.slice(1)} is already connected.`, "success");
    return;
  }

  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    if (channel === "whatsapp") await startWhatsAppConnection();
    else if (channel === "google") await startSocialOauth("google", "google");
    else if (channel === "x") await startSocialOauth("x", "x");
    else if (channel === "youtube") await startSocialOauth("youtube", "youtube");
    else if (channel === "tiktok") await startSocialOauth("tiktok", "tiktok");
    else await startSocialOauth("meta", channel);
  } catch (error) {
    console.error("Selling connection failed", {channel, error});
    sellingNotice(socialError(error), "error");
    button.disabled = false;
    button.textContent = "Sell here";
  }
}








let currentStep = 1;







const $ = (id) =>



  document.getElementById(id);











/* =========================================================



   STATUS



========================================================= */







function markStatus(



  id,



  text,



  done = true



) {







  const element = $(id);







  if (!element) {



    return;



  }







  element.textContent = text;







  element.classList.toggle(



    "connected",



    done



  );



}











/* =========================================================



   WIZARD



========================================================= */







const stepNames = {



  1: "Selling",



  2: "Delivery",



  3: "Payments",



  4: "Audience"



};











function showStep(step) {







  currentStep =



    Math.max(



      1,



      Math.min(5, Number(step))



    );











  document



    .querySelectorAll(



      "[data-wizard-step]"



    )



    .forEach(



      (panel) => {







        const panelStep =



          Number(



            panel.dataset.wizardStep



          );







        const active =



          panelStep === currentStep;







        panel.hidden =



          !active;







        panel.classList.toggle(



          "active",



          active



        );



      }



    );











  document



    .querySelectorAll(



      "[data-step-dot]"



    )



    .forEach(



      (dot) => {







        const stepNumber =



          Number(



            dot.dataset.stepDot



          );







        dot.classList.toggle(



          "active",



          stepNumber === currentStep



        );







        dot.classList.toggle(



          "complete",



          stepNumber < currentStep



        );



      }



    );











  const counter =



    $("stepCounter");







  const name =



    $("stepName");







  const progress =



    $("wizardProgress");











  if (currentStep <= 4) {







    if (counter) {



      counter.textContent =



        `Step ${currentStep} of 4`;



    }







    if (name) {



      name.textContent =



        stepNames[currentStep];



    }







    if (progress) {



      progress.style.width =



        `${currentStep * 25}%`;



    }







  } else {







    if (counter) {



      counter.textContent =



        "Setup complete";



    }







    if (name) {



      name.textContent =



        "Complete";



    }







    if (progress) {



      progress.style.width =



        "100%";



    }



  }











  window.scrollTo({



    top: 0,



    behavior: "smooth"



  });



}











document



  .querySelectorAll(



    "[data-back-step]"



  )



  .forEach(



    (button) => {







      button.addEventListener(



        "click",



        () => {







          showStep(



            Number(



              button.dataset.backStep



            )



          );



        }



      );



    }



  );











/* =========================================================



   PAYMENT METHOD



========================================================= */







function choosePayment(type) {







  selectedPay = type;











  document



    .querySelectorAll(



      "[data-pay]"



    )



    .forEach(



      (button) => {







        button.classList.toggle(



          "active",



          button.dataset.pay === type



        );



      }



    );











  [



    "eft",



    "yeyza",



    "ozow",



    "payfast",



    "other"



  ].forEach(



    (name) => {







      const element =



        $(`${name}Fields`);







      if (element) {



        element.style.display =



          name === type



            ? "grid"



            : "none";



      }



    }



  );



}











document



  .querySelectorAll(



    "[data-pay]"



  )



  .forEach(



    (button) => {







      button.addEventListener(



        "click",



        () => {







          choosePayment(



            button.dataset.pay



          );



        }



      );



    }



  );











/* =========================================================



   BANKS



========================================================= */







function syncBranch(force = true) {







  const bank =



    $("bankName");







  const branch =



    $("branchCode");











  if (



    !bank ||



    !branch



  ) {



    return;



  }











  const option =



    bank.selectedOptions?.[0];







  const code =



    String(



      option?.dataset?.branch ||



      ""



    );











  const manual =



    bank.value === "__other__" ||



    !code;











  branch.readOnly =



    !manual;











  branch.placeholder =



    manual



      ? "Enter 6-digit branch code"



      : "Universal branch code";











  if (force) {



    branch.value = code;



  }



}











$("bankName")



  ?.addEventListener(



    "change",



    () => syncBranch(true)



  );











function setSavedBank(



  name,



  branchCode



) {







  const bank =



    $("bankName");







  const branch =



    $("branchCode");











  if (



    !bank ||



    !branch



  ) {



    return;



  }











  const saved =



    String(name || "").trim();







  const savedBranch =



    String(branchCode || "").trim();











  if (saved) {







    /*



     * bankName is now guaranteed to be a SELECT.



     * Array.from is safer than spreading .options.



     */







    let option =



      Array



        .from(bank.options || [])



        .find(



          (item) =>



            item.value === saved



        );











    if (!option) {







      option =



        document.createElement(



          "option"



        );







      option.value =



        saved;







      option.textContent =



        savedBranch



          ? `${saved} · ${savedBranch}`



          : saved;











      if (savedBranch) {



        option.dataset.branch =



          savedBranch;



      }











      bank.appendChild(option);



    }











    bank.value =



      saved;



  }











  const option =



    bank.selectedOptions?.[0];







  const known =



    String(



      option?.dataset?.branch ||



      ""



    );











  branch.value =



    savedBranch ||



    known;











  branch.readOnly =



    Boolean(known) &&



    bank.value !== "__other__";











  branch.placeholder =



    branch.readOnly



      ? "Universal branch code"



      : "Enter 6-digit branch code";



}











/* =========================================================



   AUDIENCE



========================================================= */







document



  .querySelectorAll(



    "[data-gender]"



  )



  .forEach(



    (button) => {







      button.addEventListener(



        "click",



        () => {







          selectedGender =



            button.dataset.gender;











          document



            .querySelectorAll(



              "[data-gender]"



            )



            .forEach(



              (item) => {







                item.classList.toggle(



                  "active",



                  item === button



                );



              }



            );



        }



      );



    }



  );











/* =========================================================



   SELLER READINESS



========================================================= */







async function readiness(



  payload = null



) {







  if (!currentUser) {



    throw new Error(



      "Your session has expired."



    );



  }











  const token =



    await currentUser.getIdToken();











  const options = {







    method:



      payload



        ? "POST"



        : "GET",







    headers: {



      Authorization:



        "Bearer " + token,







      Accept:



        "application/json"



    },







    cache:



      "no-store",







    credentials:



      "same-origin"



  };











  if (payload) {







    options.headers[



      "Content-Type"



    ] =



      "application/json";







    options.body =



      JSON.stringify(payload);



  }











  const response =



    await fetch(



      "api/workspace.php?action=seller-readiness",



      options



    );











  const data =



    await response



      .json()



      .catch(() => ({}));











  if (



    !response.ok ||



    data.ok !== true



  ) {







    throw new Error(



      data.error ||



      "Unable to update seller setup."



    );



  }











  return data;



}











/* =========================================================



   LOAD SAVED STATE



========================================================= */







async function loadState() {







  const [



    delivery,



    banking,



    payfast,



    prefs,



    audience,



    onboardingStatus



  ] =



    await Promise.all(



      [



        "delivery",



        "banking",



        "payfast",



        "paymentPreferences",



        "audience",



        "onboardingStatus"



      ].map(



        (section) =>



          getWorkspaceSection(



            currentUser,



            section



          )



            .then(



              (response) =>



                response.data || {}



            )



            .catch(



              () => ({})



            )



      )



    );











  /* DELIVERY */







  if (



    delivery.fulfilmentMode



  ) {







    $("deliveryMethod").value =



      delivery.fulfilmentMode;







    $("deliveryProvider").value =



      delivery.courierPreference ||



      "";







    $("dispatchAddress").value =



      delivery.pickupAddress ||



      "";







    $("deliveryFee").value =



      delivery.baseDeliveryFee ??



      0;

    // Restore a previously saved delivery pin.
    restoreDeliveryMap(delivery);











    markStatus(



      "deliveryStatus",



      "Saved"



    );



  }











  /* BANK */







  if (



    banking.bankName



  ) {







    setSavedBank(



      banking.bankName,



      banking.branchCode



    );











    $("accountHolder").value =



      banking.accountHolder ||



      "";











    if (



      banking.accountNumberLast4



    ) {







      $("accountNumber").placeholder =



        "Saved account ending " +



        banking.accountNumberLast4;



    }











    choosePayment("eft");











    markStatus(



      "paymentStatus",



      "Saved"



    );



  }











  /* PAYFAST */







  else if (



    payfast.merchantId



  ) {







    $("payfastMerchantId").value =



      payfast.merchantId ||



      "";











    $("payfastSandbox").value =



      String(



        Boolean(



          payfast.sandboxMode



        )



      );











    choosePayment(



      "payfast"



    );











    markStatus(



      "paymentStatus",



      "Saved"



    );



  }











  /* OTHER PAYMENT */







  else if (



    prefs.otherGateway



  ) {







    const gateway =



      String(



        prefs.otherGateway ||



        ""



      ).toLowerCase();











    if (



      gateway === "yeyza"



    ) {







      $("yeyzaReference").value =



        prefs.otherReference ||



        "";







      choosePayment(



        "yeyza"



      );







    } else if (



      gateway === "ozow"



    ) {







      $("ozowReference").value =



        prefs.otherReference ||



        "";







      choosePayment(



        "ozow"



      );







    } else {







      $("otherGateway").value =



        prefs.otherGateway ||



        "";







      $("otherReference").value =



        prefs.otherReference ||



        "";







      choosePayment(



        "other"



      );



    }











    markStatus(



      "paymentStatus",



      "Saved"



    );



  }











  /* AUDIENCE */







  if (



    audience.gender



  ) {







    selectedGender =



      audience.gender;











    document



      .querySelectorAll(



        "[data-gender]"



      )



      .forEach(



        (button) => {







          button.classList.toggle(



            "active",



            button.dataset.gender ===



              selectedGender



          );



        }



      );











    $("ageRange").value =



      audience.ageRange ||



      "All adults";











    $("targetArea").value =



      audience.targetArea ||



      "";











    markStatus(



      "audienceStatus",



      "Saved"



    );



  }











  /*
   * Determine where the seller should resume.
   *
   * Finishing the four onboarding steps is separate from
   * verification/admin clearance. Pending verification must
   * never restart this wizard.
   */
  const state = await readiness();
  const forcedCompleteView =
    new URLSearchParams(location.search).get("complete") === "1";

  if (
    state.onboardingSubmitted === true ||
    onboardingStatus?.submitted === true ||
    forcedCompleteView
  ) {
    const note = $("finishNote");
    const finishButton = $("finishSetup");

    if (state.sellerSetupComplete === true) {
      if (note) {
        note.textContent =
          "Your seller account is ready. Continue to your dashboard.";
      }
      if (finishButton) {
        finishButton.hidden = false;
        finishButton.href = "dashboard.html";
        finishButton.innerHTML = 'Continue to dashboard <span>→</span>';
      }
    } else {
      if (note) {
        note.textContent =
          "Your seller setup is complete and has been submitted. " +
          "You can continue to your dashboard while verification or admin approval is pending. " +
          "Selling tools will unlock when approval is complete.";
      }
      if (finishButton) {
        finishButton.hidden = false;
        finishButton.href = "dashboard.html";
        finishButton.innerHTML =
          'Go to dashboard <span>→</span>';
      }
    }

    showStep(5);
    return;
  }

  if (!delivery.fulfilmentMode) {
    showStep(1);
  } else if (!state.deliveryComplete) {
    showStep(2);
  } else if (!state.paymentComplete) {
    showStep(3);
  } else if (!audience.gender) {
    showStep(4);
  } else if (state.sellerSetupComplete) {
    const finishButton = $("finishSetup");
    if (finishButton) {
      finishButton.hidden = false;
      finishButton.href = "dashboard.html";
      finishButton.innerHTML = 'Continue to dashboard <span>→</span>';
    }
    showStep(5);
  } else if (audience.gender) {
    const note = $("finishNote");
    const finishButton = $("finishSetup");

    if (note) {
      note.textContent =
        "Your onboarding information is saved. Continue to your dashboard while verification is pending.";
    }

    if (finishButton) {
      finishButton.hidden = false;
      finishButton.href = "dashboard.html";
      finishButton.innerHTML =
        'Go to dashboard <span>→</span>';
    }

    showStep(5);
  } else {
    showStep(1);
    sellingNotice(
      "External selling channels are optional. Connect the ones you want now or choose Set up later.",
      "info"
    );
  }
}


/* =========================================================
   STEP 1 — SELLING
========================================================= */

function updateSellingPlatformSummary() {
  const selected = [...selectedSellingChannels].filter((channel) => channel !== "teyza");
  const note = $("sellingPlatformNote");

  if (!note) return;

  if (!selected.length) {
    note.textContent = "Teyza Store is ready. Additional selling platforms are optional.";
    return;
  }

  const labels = {
    facebook: "Facebook",
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    google: "Google",
    x: "X",
    youtube: "YouTube",
    tiktok: "TikTok"
  };

  const deferred = deferredSellingChannels();

  note.textContent =
    "Selected: " + selected.map((channel) => labels[channel] || channel).join(", ") + "." +
    (deferred.length ?
      " You can set up " + deferred.map((channel) => sellingChannelLabels[channel] || channel).join(", ") + " later from Settings." :
      "");
}

document
  .querySelectorAll("[data-sell-here]")
  .forEach((button) => {
    button.addEventListener("click", async () => {
      const channel = String(button.dataset.sellHere || "").trim();
      if (!channel) return;
      await connectSellingChannel(channel, button);
    });
  });

async function saveSellingStep({setupLater = false} = {}) {
  const deferred = deferredSellingChannels();

  await saveWorkspaceSection(
    currentUser,
    "sellingChannels",
    {
      teyza: true,
      facebook: selectedSellingChannels.has("facebook"),
      instagram: selectedSellingChannels.has("instagram"),
      whatsapp: selectedSellingChannels.has("whatsapp"),
      google: selectedSellingChannels.has("google"),
      x: selectedSellingChannels.has("x"),
      youtube: selectedSellingChannels.has("youtube"),
      tiktok: selectedSellingChannels.has("tiktok"),
      setupLater: Boolean(setupLater && deferred.length),
      deferredChannels: setupLater ? deferred : [],
      updatedAt: new Date().toISOString()
    }
  );
}

$("continueSelling")
  ?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;

    /*
     * External channels are optional. Never let a provider/API
     * problem trap the seller on Step 1.
     */
    showStep(2);

    try {
      button.disabled = true;
      button.textContent = "Saving…";
      await saveSellingStep({setupLater: false});
    } catch (error) {
      console.error("Unable to save selling channels", error);
      sellingNotice(
        "Your selling-channel choices could not be saved just now, but you can continue setup. You can update them later from Sales channels.",
        "info"
      );
    } finally {
      button.disabled = false;
      button.innerHTML = 'Continue <span>→</span>';
    }
  });

$("setupSellingLater")
  ?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const deferred = deferredSellingChannels();

    /*
     * This button means exactly what it says: continue onboarding
     * without requiring any external provider to be connected.
     */
    showStep(2);

    try {
      button.disabled = true;
      button.textContent = "Saving…";
      await saveSellingStep({setupLater: true});

      if (deferred.length) {
        sellingNotice(
          deferred.map((channel) => sellingChannelLabels[channel] || channel).join(", ") +
          " can be connected later from Settings → Sales channels.",
          "info"
        );
      }
    } catch (error) {
      console.error("Unable to save deferred selling channels", error);
      sellingNotice(
        "External channels have been deferred for this setup. You can connect them later from Sales channels.",
        "info"
      );
    } finally {
      button.disabled = false;
      const remaining = deferredSellingChannels();
      button.textContent = remaining.length ?
        `Set up ${remaining.length} channel${remaining.length === 1 ? "" : "s"} later` :
        "Set up later";
    }
  });

/* =========================================================



   DELIVERY LOCATION MAP



========================================================= */







let deliveryMap = null;



let deliveryMarker = null;



let pendingDeliveryLocation = null;











/* ---------------------------------------------------------



   Helpers



--------------------------------------------------------- */







function deliveryMapElements() {



  return {



    map: $("deliveryMap"),



    placeholder: $("deliveryMapPlaceholder"),



    address: $("dispatchAddress"),



    latitude: $("deliveryLatitude"),



    longitude: $("deliveryLongitude"),



    confirmed: $("deliveryLocationConfirmed"),



    confirmationStatus: $("mapConfirmationStatus"),



    addressPreview: $("mapAddressPreview"),



    coordinates: $("mapCoordinates"),



    confirmButton: $("confirmDeliveryLocation"),



    findButton: $("findDeliveryAddress")



  };



}











function setMapMessage(message) {



  const elements = deliveryMapElements();







  if (elements.coordinates) {



    elements.coordinates.textContent = message;



  }



}











function setMapConfirmed(confirmed) {



  const elements = deliveryMapElements();







  if (elements.confirmed) {



    elements.confirmed.value =



      confirmed ? "true" : "false";



  }







  if (elements.confirmationStatus) {



    elements.confirmationStatus.textContent =



      confirmed ? "Confirmed" : "Not confirmed";







    elements.confirmationStatus.classList.toggle(



      "connected",



      confirmed



    );



  }







  if (elements.confirmButton) {



    elements.confirmButton.textContent =



      confirmed



        ? "Location confirmed ✓"



        : "Confirm this location";



  }



}











/* ---------------------------------------------------------



   Initialise Leaflet



--------------------------------------------------------- */







function initialiseDeliveryMap() {







  const container =



    $("deliveryMap");







  if (!container) {



    return;



  }







  if (



    typeof window.L === "undefined"



  ) {



    console.error(



      "Leaflet could not be loaded."



    );







    setMapMessage(



      "Map service could not be loaded. Refresh the page and try again."



    );







    return;



  }







  if (deliveryMap) {



    setTimeout(



      () => deliveryMap.invalidateSize(),



      100



    );







    return;



  }











  /*



   * South Africa as the initial view.



   * Once an address is found we zoom directly



   * to the seller's business.



   */







  deliveryMap =



    window.L.map(



      container,



      {



        zoomControl: true,



        attributionControl: true



      }



    ).setView(



      [-30.5595, 22.9375],



      5



    );











  window.L



    .tileLayer(



      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",



      {



        maxZoom: 19,



        attribution:



          '&copy; OpenStreetMap contributors'



      }



    )



    .addTo(deliveryMap);











  /*



   * Clicking anywhere on the map moves the marker.



   * The seller must still explicitly confirm it.



   */







  deliveryMap.on(



    "click",



    async (event) => {







      const lat =



        Number(event.latlng.lat);







      const lng =



        Number(event.latlng.lng);







      await setDeliveryLocation(



        lat,



        lng,



        "",



        false,



        true



      );



    }



  );











  setTimeout(



    () => deliveryMap.invalidateSize(),



    250



  );



}











/* ---------------------------------------------------------



   Marker



--------------------------------------------------------- */







function placeDeliveryMarker(



  lat,



  lng



) {







  initialiseDeliveryMap();







  if (!deliveryMap) {



    return;



  }







  if (deliveryMarker) {







    deliveryMarker.setLatLng(



      [lat, lng]



    );







  } else {







    deliveryMarker =



      window.L.marker(



        [lat, lng],



        {



          draggable: true



        }



      )



      .addTo(deliveryMap);











    deliveryMarker.on(



      "dragend",



      async () => {







        const position =



          deliveryMarker.getLatLng();







        await setDeliveryLocation(



          position.lat,



          position.lng,



          "",



          false,



          true



        );



      }



    );



  }











  deliveryMap.setView(



    [lat, lng],



    17



  );











  setTimeout(



    () => deliveryMap.invalidateSize(),



    100



  );



}











/* ---------------------------------------------------------



   Reverse geocode coordinates -> address



--------------------------------------------------------- */







async function reverseGeocodeDelivery(



  lat,



  lng



) {







  try {







    const url =



      "https://nominatim.openstreetmap.org/reverse" +



      "?format=jsonv2" +



      "&lat=" +



      encodeURIComponent(lat) +



      "&lon=" +



      encodeURIComponent(lng) +



      "&zoom=18" +



      "&addressdetails=1";











    const response =



      await fetch(



        url,



        {



          headers: {



            Accept:



              "application/json"



          }



        }



      );











    if (!response.ok) {



      return "";



    }











    const data =



      await response.json();











    return String(



      data.display_name || ""



    ).trim();







  } catch (error) {







    console.warn(



      "Reverse geocoding failed:",



      error



    );







    return "";



  }



}











/* ---------------------------------------------------------



   Apply map position



--------------------------------------------------------- */







async function setDeliveryLocation(



  lat,



  lng,



  address = "",



  confirmed = false,



  reverseLookup = false



) {







  lat = Number(lat);



  lng = Number(lng);











  if (



    !Number.isFinite(lat) ||



    !Number.isFinite(lng)



  ) {



    return;



  }











  placeDeliveryMarker(



    lat,



    lng



  );











  let resolvedAddress =



    String(address || "").trim();











  if (



    reverseLookup ||



    !resolvedAddress



  ) {







    const reverseAddress =



      await reverseGeocodeDelivery(



        lat,



        lng



      );







    if (reverseAddress) {



      resolvedAddress =



        reverseAddress;



    }



  }











  pendingDeliveryLocation = {



    lat,



    lng,



    address: resolvedAddress



  };











  const elements =



    deliveryMapElements();











  if (elements.latitude) {



    elements.latitude.value =



      lat.toFixed(7);



  }











  if (elements.longitude) {



    elements.longitude.value =



      lng.toFixed(7);



  }











  if (



    resolvedAddress &&



    elements.address



  ) {



    elements.address.value =



      resolvedAddress;



  }











  if (elements.addressPreview) {







    elements.addressPreview.textContent =



      resolvedAddress ||



      "Selected business location";



  }











  if (elements.coordinates) {







    elements.coordinates.textContent =



      lat.toFixed(6) +



      ", " +



      lng.toFixed(6);



  }











  if (elements.placeholder) {



    elements.placeholder.hidden =



      true;



  }











  if (elements.confirmButton) {



    elements.confirmButton.disabled =



      false;



  }











  setMapConfirmed(



    confirmed



  );



}











/* ---------------------------------------------------------



   Address search



--------------------------------------------------------- */







async function findDeliveryAddress() {







  const elements =



    deliveryMapElements();











  const address =



    String(



      elements.address?.value || ""



    ).trim();











  if (!address) {







    alert(



      "Enter your dispatch or collection address first."



    );







    elements.address?.focus();







    return;



  }











  const button =



    elements.findButton;











  const originalText =



    button?.textContent ||



    "Find on map";











  if (button) {







    button.disabled = true;



    button.textContent =



      "Finding…";



  }











  try {







    /*



     * Restrict normal searches to South Africa.



     */







    const search =



      address



        .toLowerCase()



        .includes("south africa")



        ? address



        : address + ", South Africa";











    const url =



      "https://nominatim.openstreetmap.org/search" +



      "?format=jsonv2" +



      "&limit=1" +



      "&countrycodes=za" +



      "&addressdetails=1" +



      "&q=" +



      encodeURIComponent(search);











    const response =



      await fetch(



        url,



        {



          headers: {



            Accept:



              "application/json"



          }



        }



      );











    if (!response.ok) {







      throw new Error(



        "Unable to search for this address."



      );



    }











    const results =



      await response.json();











    if (



      !Array.isArray(results) ||



      !results.length



    ) {







      throw new Error(



        "We could not find this address. Try adding the suburb, city and province."



      );



    }











    const result =



      results[0];











    const lat =



      Number(result.lat);







    const lng =



      Number(result.lon);











    if (



      !Number.isFinite(lat) ||



      !Number.isFinite(lng)



    ) {







      throw new Error(



        "The map returned an invalid location."



      );



    }











    await setDeliveryLocation(



      lat,



      lng,



      result.display_name ||



        address,



      false,



      false



    );











    setMapMessage(



      "Check the marker carefully. Drag it if necessary, then confirm this location."



    );











  } catch (error) {







    console.error(



      "Delivery address lookup failed",



      error



    );











    alert(



      error.message ||



      "Unable to find this address."



    );











  } finally {







    if (button) {







      button.disabled = false;



      button.textContent =



        originalText;



    }



  }



}











/* ---------------------------------------------------------



   Confirm map location



--------------------------------------------------------- */







async function verifyBusinessLocation() {
  if (!currentUser) {
    throw new Error("Your session has expired. Sign in again.");
  }

  if (!pendingDeliveryLocation) {
    throw new Error("Find your business location on the map first.");
  }

  const address = String(
    pendingDeliveryLocation.address ||
    $("dispatchAddress")?.value ||
    ""
  ).trim();

  if (!address) {
    throw new Error("Confirm the business address before continuing.");
  }

  const token = await currentUser.getIdToken();

  const response = await fetch(
    "api/workspace.php?action=verification",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        type: "location",
        lat: Number(pendingDeliveryLocation.lat),
        lng: Number(pendingDeliveryLocation.lng),
        address
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok !== true) {
    throw new Error(
      data.error ||
      "Unable to confirm your business location."
    );
  }

  return data;
}


async function confirmDeliveryLocation() {
  if (!pendingDeliveryLocation) {
    alert("Find your business location on the map first.");
    return;
  }

  const elements = deliveryMapElements();
  const button = elements.confirmButton;
  const originalText = button?.textContent || "Confirm this location";

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Confirming…";
    }

    await verifyBusinessLocation();

    setMapConfirmed(true);

    if (elements.addressPreview) {
      elements.addressPreview.textContent =
        pendingDeliveryLocation.address ||
        "Business location confirmed";
    }

    if (elements.coordinates) {
      elements.coordinates.textContent =
        "Confirmed · " +
        Number(pendingDeliveryLocation.lat).toFixed(6) +
        ", " +
        Number(pendingDeliveryLocation.lng).toFixed(6);
    }

    if (button) {
      button.textContent = "Location confirmed ✓";
    }

    markStatus(
      "deliveryStatus",
      "Location confirmed"
    );
  } catch (error) {
    console.error(
      "Business location verification failed",
      error
    );

    setMapConfirmed(false);

    alert(
      workspaceError(
        error,
        "confirm business location"
      )
    );

    if (button) {
      button.textContent = originalText;
    }
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}


/* ---------------------------------------------------------
   Search button



--------------------------------------------------------- */







$("findDeliveryAddress")



  ?.addEventListener(



    "click",



    findDeliveryAddress



  );











/* ---------------------------------------------------------



   Confirm button



--------------------------------------------------------- */







$("confirmDeliveryLocation")



  ?.addEventListener(



    "click",



    confirmDeliveryLocation



  );











/* ---------------------------------------------------------



   Press Enter in address field



--------------------------------------------------------- */







$("dispatchAddress")



  ?.addEventListener(



    "keydown",



    (event) => {







      if (



        event.key === "Enter"



      ) {







        event.preventDefault();







        findDeliveryAddress();



      }



    }



  );











/* ---------------------------------------------------------



   Changing address invalidates previous confirmation



--------------------------------------------------------- */







$("dispatchAddress")



  ?.addEventListener(



    "input",



    () => {







      setMapConfirmed(



        false



      );



    }



  );











/* ---------------------------------------------------------



   Browser current location



--------------------------------------------------------- */







async function useCurrentDeliveryLocation() {







  if (



    !navigator.geolocation



  ) {







    alert(



      "Location detection is not available on this device."



    );







    return;



  }











  setMapMessage(



    "Finding your current location…"



  );











  navigator.geolocation.getCurrentPosition(







    async (position) => {







      await setDeliveryLocation(



        position.coords.latitude,



        position.coords.longitude,



        "",



        false,



        true



      );











      setMapMessage(



        "We found your location. Check the marker and confirm it."



      );



    },











    (error) => {







      console.warn(



        "Location detection failed",



        error



      );











      setMapMessage(



        "We could not detect your location. Search for your address instead."



      );



    },











    {



      enableHighAccuracy: true,



      timeout: 12000,



      maximumAge: 60000



    }



  );



}











/* ---------------------------------------------------------



   Restore a previously saved map position



--------------------------------------------------------- */







function restoreDeliveryMap(



  delivery = {}



) {







  const lat =



    Number(



      delivery.latitude ??



      delivery.lat



    );











  const lng =



    Number(



      delivery.longitude ??



      delivery.lng



    );











  if (



    !Number.isFinite(lat) ||



    !Number.isFinite(lng)



  ) {







    return;



  }











  setDeliveryLocation(



    lat,



    lng,



    delivery.pickupAddress || "",



    Boolean(



      delivery.locationConfirmed



    ),



    false



  );



}



/* =========================================================



   STEP 2 — DELIVERY



========================================================= */







$("saveDelivery")



  ?.addEventListener(



    "click",







    async (event) => {







      const button =



        event.currentTarget;











      const method =



        $("deliveryMethod")



          .value;











      if (!method) {







        alert(



          "Choose how customers will receive orders."



        );







        return;



      }











      const address =



        $("dispatchAddress")



          .value



          .trim();











      if (!address) {







        alert(



          "Confirm your dispatch or collection address."



        );







        return;



      }











      button.disabled =



        true;







      button.textContent =



        "Saving…";











      try {







        await saveWorkspaceSection(



          currentUser,



          "delivery",



          {



            fulfilmentMode:



              method,







            courierPreference:



              $("deliveryProvider")



                .value



                .trim(),







            pickupAddress:



              address,







            baseDeliveryFee:



              Number(



                $("deliveryFee")



                  .value ||



                0



              ),







            latitude:



              Number($("deliveryLatitude")?.value || 0) || null,



            longitude:



              Number($("deliveryLongitude")?.value || 0) || null,



            locationConfirmed:



              $("deliveryLocationConfirmed")?.value === "true",



            trackingEnabled:



              true



          }



        );











        const state =



          await readiness({



            deliveryComplete: true



          });











        if (



          !state.deliveryComplete



        ) {







          throw new Error(



            "Your delivery setup was saved, " +



            "but the collection address must match " +



            "your verified business address."



          );



        }











        markStatus(



          "deliveryStatus",



          "Saved"



        );











        showStep(3);







      } catch (error) {







        alert(



          workspaceError(



            error,



            "save delivery settings"



          )



        );







      } finally {







        button.disabled =



          false;







        button.innerHTML =



          'Save & continue <span>→</span>';



      }



    }



  );











/* =========================================================



   STEP 3 — PAYMENT



========================================================= */







$("savePayments")



  ?.addEventListener(



    "click",







    async (event) => {







      const button =



        event.currentTarget;











      button.disabled =



        true;







      button.textContent =



        "Saving…";











      try {







        if (



          selectedPay === "eft"



        ) {







          const accountNumber =



            $("accountNumber")



              .value



              .trim();











          const hasSavedAccount =



            $("accountNumber")



              .placeholder



              .includes(



                "ending"



              );











          const bank =



            $("bankName")



              .value



              .trim();











          const accountHolder =



            $("accountHolder")



              .value



              .trim();











          const branch =



            $("branchCode")



              .value



              .trim();











          if (



            !bank ||



            !accountHolder ||



            (



              !accountNumber &&



              !hasSavedAccount



            )



          ) {







            throw new Error(



              "Complete the bank, account holder and account number."



            );



          }











          if (



            !/^\d{6}$/.test(



              branch



            )



          ) {







            throw new Error(



              "Branch code must be 6 digits."



            );



          }











          const data = {







            bankName:



              bank === "__other__"



                ? "Other South African bank"



                : bank,







            accountHolder,







            branchCode:



              branch,







            accountType:



              "Business"



          };











          if (



            accountNumber



          ) {







            data.accountNumber =



              accountNumber;







            data.accountNumberLast4 =



              accountNumber.slice(-4);



          }











          await saveWorkspaceSection(



            currentUser,



            "banking",



            data



          );







        } else if (



          selectedPay === "yeyza"



        ) {







          await saveWorkspaceSection(



            currentUser,



            "paymentPreferences",



            {



              otherGateway:



                "Yeyza",







              otherReference:



                $("yeyzaReference")



                  .value



                  .trim()



            }



          );







        } else if (



          selectedPay === "ozow"



        ) {







          await saveWorkspaceSection(



            currentUser,



            "paymentPreferences",



            {



              otherGateway:



                "Ozow",







              otherReference:



                $("ozowReference")



                  .value



                  .trim()



            }



          );







        } else if (



          selectedPay === "payfast"



        ) {







          if (



            !$("payfastMerchantId")



              .value



              .trim() ||







            !$("payfastMerchantKey")



              .value



              .trim()



          ) {







            throw new Error(



              "Enter your PayFast Merchant ID and Merchant Key."



            );



          }











          await saveWorkspaceSection(



            currentUser,



            "payfast",



            {



              merchantId:



                $("payfastMerchantId")



                  .value



                  .trim(),







              merchantKey:



                $("payfastMerchantKey")



                  .value,







              passphrase:



                $("payfastPassphrase")



                  .value,







              sandboxMode:



                $("payfastSandbox")



                  .value ===



                "true",







              connected:



                true



            }



          );







        } else {







          const gateway =



            $("otherGateway")



              .value



              .trim();











          if (!gateway) {







            throw new Error(



              "Enter the payment gateway name."



            );



          }











          await saveWorkspaceSection(



            currentUser,



            "paymentPreferences",



            {



              otherGateway:



                gateway,







              otherReference:



                $("otherReference")



                  .value



                  .trim()



            }



          );



        }











        const state =



          await readiness({



            paymentComplete: true



          });











        if (



          !state.paymentComplete



        ) {







          throw new Error(



            "Your payment details could not be confirmed."



          );



        }











        markStatus(



          "paymentStatus",



          "Saved"



        );











        showStep(4);







      } catch (error) {







        alert(



          error.message ||



          "Unable to save payment settings."



        );







      } finally {







        button.disabled =



          false;







        button.innerHTML =



          'Save & continue <span>→</span>';



      }



    }



  );











/* =========================================================



   STEP 4 — AUDIENCE



========================================================= */







$("saveAudience")
  ?.addEventListener(
    "click",
    async (event) => {
      const button = event.currentTarget;

      button.disabled = true;
      button.textContent = "Saving…";

      try {
        await saveWorkspaceSection(
          currentUser,
          "audience",
          {
            gender: selectedGender,
            ageRange: $("ageRange").value,
            targetArea: $("targetArea").value.trim()
          }
        );

        markStatus(
          "audienceStatus",
          "Saved"
        );

        /*
         * The seller has now completed every seller-controlled
         * onboarding step. This state is deliberately separate from
         * verification/admin approval.
         */
        await saveWorkspaceSection(
          currentUser,
          "onboardingStatus",
          {
            submitted: true,
            submittedAt: new Date().toISOString(),
            externalChannelsOptional: true
          }
        );

        history.replaceState(
          {},
          "",
          "seller-onboarding.html?complete=1"
        );

        const note = $("finishNote");
        const finishButton = $("finishSetup");

        if (note) {
          note.textContent =
            "Your seller setup is complete and has been submitted. " +
            "You can continue to your dashboard while verification or admin approval is pending. " +
            "Selling tools will unlock when approval is complete.";
        }

        if (finishButton) {
          finishButton.hidden = false;
          finishButton.href = "dashboard.html";
          finishButton.innerHTML =
            'Go to dashboard <span>→</span>';
        }

        /*
         * Show completion immediately. No readiness result is allowed
         * to send the seller back to Step 1 after this point.
         */
        showStep(5);

        /*
         * Refresh backend-derived state only to improve the message.
         * This never controls whether the completion screen remains open.
         */
        try {
          const state = await readiness();

          if (state.sellerSetupComplete === true) {
            if (note) {
              note.textContent =
                "Your seller account is ready. Continue to your dashboard.";
            }

            if (finishButton) {
              finishButton.innerHTML =
                'Continue to dashboard <span>→</span>';
            }
          }
        } catch (readinessError) {
          console.warn(
            "Seller readiness refresh failed after onboarding submission",
            readinessError
          );
        }

      } catch (error) {
        alert(
          workspaceError(
            error,
            "save audience"
          )
        );
      } finally {
        button.disabled = false;
        button.innerHTML =
          'Finish setup <span>✓</span>';
      }
    }
  );



/* =========================================================



   AUTH



========================================================= */







onAuthStateChanged(



  auth,







  async (user) => {







    if (!user) {







      location.replace(



        "index.html?auth=login"



      );







      return;



    }











    currentUser =



      user;











    try {







      const context =



        await getBusinessContext(



          user



        );











      businessId =



        context.businessId;











      if (!businessId) {
        // Keep the seller inside the unified onboarding experience.
        // Older/new workspaces may not yet expose a separate businessId.
        businessId = String(user.uid || "");
      }

      if (!businessId) {
        throw new Error("Your Teyza workspace could not be identified.");
      }











      await loadState();

      const onboardingParams = new URLSearchParams(location.search);
      const requestedStep = Number(onboardingParams.get("step"));
      if (Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 4) {
        showStep(requestedStep);
      }

      await refreshSellingConnections().catch((error) => {
        console.error("Unable to load selling connections", error);
        sellingNotice(socialError(error, "Unable to load selling connections."), "error");
      });

      const oauthStatus = onboardingParams.get("social");
      const oauthProvider = onboardingParams.get("provider");
      if (oauthStatus === "connected" && oauthProvider === "x") {
        sellingNotice("X connected successfully. Continue when you are ready.", "success");
      } else if (oauthStatus === "connected" && oauthProvider === "youtube") {
        sellingNotice("YouTube connected successfully. Continue when you are ready.", "success");
      } else if (oauthStatus === "connected" && oauthProvider === "tiktok") {
        sellingNotice("TikTok connected successfully. Continue when you are ready.", "success");
      } else if (oauthStatus === "error" && ["x", "youtube", "tiktok"].includes(oauthProvider)) {
        sellingNotice(`${oauthProvider === "x" ? "X" : oauthProvider === "youtube" ? "YouTube" : "TikTok"} connection could not be completed. Check the provider callback, credentials and approved scopes, then try again.`, "error");
      } else if (oauthStatus === "cancelled" && ["x", "youtube", "tiktok"].includes(oauthProvider)) {
        sellingNotice(`${oauthProvider === "x" ? "X" : oauthProvider === "youtube" ? "YouTube" : "TikTok"} connection was cancelled.`, "info");
      }











    } catch (error) {







      console.error(



        "Seller setup load failed",



        error



      );











      const status =



        document.querySelector(



          "[data-workspace-status]"



        );











      if (status) {







        status.hidden =



          false;







        status.textContent =



          workspaceError(



            error



          );



      }



    }



  }



);
