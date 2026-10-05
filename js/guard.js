import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
  auth
} from "./firebase-config.js";

import {
  getBusinessContext,
  hydrateBusiness,
  workspaceError
} from "./business-context.js";


/* =========================================================
   TEYZA SELLER ACCESS GUARD

   RULES

   1. Not logged in
      -> Login

   2. Logged in + seller-owned onboarding incomplete
      -> seller-onboarding.html

   3. Seller-owned onboarding complete
      -> Dashboard / seller workspace

      Verification/admin approval may still be pending.
      Those states control selling/publishing, not dashboard access.

   4. Completed seller opens onboarding normally
      -> Dashboard

   5. Completed seller opens onboarding with ?review=1
      -> Allow access for reviewing/editing setup
========================================================= */


const WORKSPACE_API = location.hostname.endsWith(".vercel.app")
  ? "/backend/workspace.php"
  : "api/workspace.php";

const page =
  location.pathname.split("/").pop() ||
  "dashboard.html";


const onboardingPages = new Set([
  "business-profile.html",
  "seller-onboarding.html"
]);


/*
 * Pages that require completed seller onboarding.
 *
 * These must NEVER be available to an incomplete seller.
 */
const protectedSellerPages = new Set([
  "dashboard.html",
  "customers.html",
  "orders.html",
  "products.html",
  "store.html",
  "settings.html",
  "network.html",
  "shop-settings.html",
  "website-builder.html",
  "domains.html",
  "sell.html",
  "services.html",
  "bookings.html",
  "payments.html",
  "sales-channels.html"
]);


/* =========================================================
   PREVENT DASHBOARD FLASH

   Hide protected seller pages while authentication and
   backend onboarding status are being checked.
========================================================= */

const shouldLockPage =
  protectedSellerPages.has(page);


if (shouldLockPage) {
  document.documentElement.classList.add(
    "seller-access-check"
  );
}


/* =========================================================
   HELPER: SHOW PAGE
========================================================= */

function unlockPage() {

  document.documentElement.classList.remove(
    "seller-access-check"
  );

  document.documentElement.classList.add(
    "seller-access-ready"
  );
}


/* =========================================================
   HELPER: REDIRECT TO LOGIN
========================================================= */

function redirectToLogin() {

  const destination =
    page +
    location.search +
    location.hash;

  location.replace(
    "index.html?auth=login&redirect=" +
    encodeURIComponent(destination)
  );
}


/* =========================================================
   HELPER: REDIRECT TO ONBOARDING
========================================================= */

function redirectToOnboarding(setup = {}) {

  const destination =
    setup.businessProfileComplete === true
      ? "seller-onboarding.html"
      : "business-profile.html?onboarding=1";

  const destinationPage =
    destination.split("?")[0];

  if (page === destinationPage) {
    return;
  }

  location.replace(destination);
}


/* =========================================================
   GET SELLER READINESS FROM BACKEND

   Backend is the source of truth.

   Do NOT use localStorage to decide whether onboarding
   has been completed.
========================================================= */

async function getSellerReadiness(user) {

  const token =
    await user.getIdToken();

  const response =
    await fetch(
      `${WORKSPACE_API}?action=seller-readiness`,
      {
        method: "GET",

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
      }
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
      "Unable to load seller setup."
    );
  }


  return data;
}


/* =========================================================
   AUTHENTICATION + SELLER ACCESS
========================================================= */

onAuthStateChanged(
  auth,

  async (user) => {

    /* -----------------------------------------------------
       USER NOT LOGGED IN
    ----------------------------------------------------- */

    if (!user) {

      redirectToLogin();

      return;
    }


    /* -----------------------------------------------------
       DISPLAY ACCOUNT INFORMATION
    ----------------------------------------------------- */

    const displayName =
      user.displayName ||
      "Business owner";


    document
      .querySelectorAll(
        "[data-auth-name]"
      )
      .forEach(
        (element) => {

          element.textContent =
            displayName;
        }
      );


    const initial =
      (
        user.displayName ||
        user.email ||
        "U"
      )
        .charAt(0)
        .toUpperCase();


    document
      .querySelectorAll(
        "[data-auth-initial]"
      )
      .forEach(
        (element) => {

          element.textContent =
            initial;
        }
      );


    try {

      /* ---------------------------------------------------
         LOAD BUSINESS + ONBOARDING STATE
      --------------------------------------------------- */

      const [
        context,
        setup
      ] =
        await Promise.all([
          getBusinessContext(user),
          getSellerReadiness(user)
        ]);


      /* ---------------------------------------------------
         HYDRATE BUSINESS INFORMATION
      --------------------------------------------------- */

      hydrateBusiness(
        context,
        user
      );


      /* ---------------------------------------------------
         BACKEND IS SOURCE OF TRUTH
      --------------------------------------------------- */

      /*
       * Dashboard access is based on completion of the
       * seller-owned onboarding flow.
       *
       * Verification/admin approval is intentionally NOT
       * used here. Those states control productReady instead.
       */
      const complete =
        setup.dashboardAccess === true ||
        setup.sellerSetupComplete === true;

      console.info('[Teyza access guard]', {
        page,
        dashboardAccess: setup.dashboardAccess,
        sellerSetupComplete: setup.sellerSetupComplete,
        productReady: setup.productReady
      });


      /* ===================================================
         INCOMPLETE SELLER
      =================================================== */

      if (!complete) {

        /*
         * The seller is ONLY allowed inside the
         * onboarding experience.
         */

        if (
          page === "seller-onboarding.html" &&
          setup.businessProfileComplete !== true
        ) {
          location.replace("business-profile.html?onboarding=1");
          return;
        }

        if (!onboardingPages.has(page)) {
          redirectToOnboarding(setup);
          return;
        }


        document
          .documentElement
          .classList
          .add(
            "onboarding-locked"
          );


        if (document.body) {

          document.body
            .classList
            .add(
              "onboarding-locked"
            );
        }


        /*
         * The onboarding page itself may now render.
         */

        unlockPage();

        return;
      }


      /* ===================================================
         COMPLETED SELLER
      =================================================== */

      document
        .documentElement
        .classList
        .remove(
          "onboarding-locked"
        );


      if (document.body) {

        document.body
          .classList
          .remove(
            "onboarding-locked"
          );
      }


      /*
       * If setup is already complete and the seller
       * opens onboarding normally, return them to
       * dashboard.
       *
       * ?review=1 allows them to intentionally review
       * their onboarding information.
       */

      if (
        page ===
          "seller-onboarding.html" &&
        !new URLSearchParams(
          location.search
        ).has("review")
      ) {

        location.replace(
          "dashboard.html"
        );

        return;
      }


      /* ---------------------------------------------------
         SELLER IS AUTHORISED
      --------------------------------------------------- */

      unlockPage();

    }

    catch (error) {

      console.error(
        "Business access failed",
        error
      );


      /*
       * IMPORTANT:
       *
       * A backend/readiness failure must NOT silently
       * unlock protected seller pages.
       */

      if (
        protectedSellerPages.has(page)
      ) {

        const status =
          document.querySelector(
            "[data-workspace-status]"
          );


        if (status) {

          status.hidden =
            false;

          status.classList.add(
            "error"
          );

          status.textContent =
            workspaceError(error);
        }


        /*
         * Keep protected page locked.
         */

        return;
      }


      /*
       * On onboarding page we can display the error
       * instead of exposing the dashboard.
       */

      const status =
        document.querySelector(
          "[data-workspace-status]"
        );


      if (status) {

        status.hidden =
          false;

        status.classList.add(
          "error"
        );

        status.textContent =
          workspaceError(error);
      }


      unlockPage();
    }
  }
);