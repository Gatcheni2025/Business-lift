export function initializeDashboardUI() {
  const page = window.location.pathname.split("/").pop() || "dashboard.html";
  if (page !== "dashboard.html") return;

  const style = document.createElement("style");
  style.id = "businessExpoDashboardStyles";
  style.textContent = `
    html,body{max-width:100%}.main-content{min-width:0}.wizard-body>*,.container>*,.topbar>*{min-width:0}
    .table-panel{overflow-x:auto;-webkit-overflow-scrolling:touch}.data-table{min-width:760px}img{max-width:100%}
    .mobile-menu-btn{display:none;width:42px;height:42px;border:1px solid #e2e8f0;border-radius:11px;background:#fff;color:#0f172a;align-items:center;justify-content:center;font-size:1.35rem;cursor:pointer;flex:0 0 auto}
    .mobile-sidebar-backdrop{display:none;position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:45;backdrop-filter:blur(2px)}
    @media(max-width:1100px){.sidebar{width:88px;flex:0 0 88px}.sidebar-header{justify-content:center;padding:20px 12px}.sidebar-header .brand,.nav-label{display:none!important}.nav-list{padding:16px 10px}.nav-link{justify-content:center;padding:13px 10px;font-size:0;gap:0}.nav-link i{font-size:1.45rem}.topbar{padding:20px 24px}.container{padding:24px}.wizard-body{grid-template-columns:1fr!important;gap:28px!important}.wizard-header{padding:20px 24px;gap:14px;flex-wrap:wrap}.pricing-grid{grid-template-columns:1fr!important}.paywall-modal{max-height:88vh;overflow-y:auto}}
    @media(max-width:760px){body{display:block!important;height:auto!important;min-height:100vh;overflow:auto!important}.sidebar{position:fixed!important;top:0;left:0;bottom:0;width:min(82vw,300px)!important;height:100vh;z-index:60;transform:translateX(-105%);transition:transform .25s ease;box-shadow:18px 0 45px rgba(15,23,42,.16)}.sidebar.mobile-open{transform:translateX(0)}.mobile-sidebar-backdrop.active{display:block}.sidebar-header{justify-content:flex-start;padding:20px}.sidebar-header .brand{display:block!important}.nav-label{display:block!important}.nav-list{padding:14px 16px 28px}.nav-link{justify-content:flex-start;padding:12px;font-size:.95rem;gap:12px}.nav-link i{font-size:1.3rem}.main-content{width:100%;min-height:100vh;overflow:visible!important}.topbar{position:sticky;top:0;padding:14px 16px;gap:12px}.topbar>div:first-of-type{flex:1;min-width:0}.topbar h1{font-size:1.12rem!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.topbar p{font-size:.76rem!important}.user-profile span{display:none}.avatar{width:36px;height:36px;font-size:.8rem}.mobile-menu-btn{display:inline-flex;order:-1}.container{padding:16px}.wizard-panel,.table-panel{border-radius:16px;margin-bottom:20px}.wizard-header{padding:18px;align-items:flex-start;flex-direction:column}.wizard-header h2{font-size:1.15rem}.wizard-body{padding:18px!important;gap:22px!important}.form-section{margin-bottom:24px}.upload-area{padding:24px 16px}.channel-grid{grid-template-columns:1fr!important}.channel-opt{min-height:52px}.reach-box{padding:20px 14px}.reach-box h2{font-size:2rem!important;overflow-wrap:anywhere}.mockup-img{height:210px!important}.mockup-body{padding:16px}#exposeBtn{padding:15px!important;font-size:.98rem!important}.table-panel{padding:16px}.data-table{min-width:700px;font-size:.86rem}.data-table th,.data-table td{padding:12px}.modal-overlay{padding:12px;align-items:flex-start;overflow-y:auto}.paywall-modal{width:100%!important;max-height:none;margin:20px 0;padding:28px 18px!important;border-radius:18px}.pricing-grid{gap:16px!important;margin-top:24px!important}}
    @media(max-width:420px){.topbar{padding:12px}.container{padding:12px}.wizard-body{padding:14px!important}.wizard-header{padding:16px 14px}.reach-box h2{font-size:1.65rem!important}}
  `;
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  const sidebar = document.getElementById("sidebar");
  const topbar = document.querySelector(".topbar");
  const navList = document.querySelector(".nav-list");

  if (navList) {
    navList.innerHTML = `
      <a href="dashboard.html" class="nav-link active"><i class="ph ph-house"></i> Dashboard</a>
      <a href="#wizardPanel" class="nav-link"><i class="ph ph-plus-circle"></i> Sell More</a>
      <a href="sales-channels.html?return=dashboard" class="nav-link"><i class="ph ph-plugs-connected"></i> Connections</a>
      <a href="orders.html" class="nav-link"><i class="ph ph-receipt"></i> Orders</a>
      <a href="delivery-settings.html" class="nav-link"><i class="ph ph-truck"></i> Delivery</a>
      <a href="shop-settings.html" class="nav-link"><i class="ph ph-gear"></i> Shop Settings</a>
      <a href="network.html" class="nav-link"><i class="ph ph-handshake"></i> Network</a>
    `;
  }

  if (topbar && !document.getElementById("sellerSetupQuickLink")) {
    const profile = topbar.querySelector(".user-profile");
    const quick = document.createElement("a");
    quick.id = "sellerSetupQuickLink";
    quick.href = "seller-onboarding.html";
    quick.title = "Seller setup guide";
    quick.innerHTML = '<i class="ph ph-list-checks"></i>';
    quick.style.cssText = "width:40px;height:40px;border-radius:10px;border:1px solid #e2e8f0;background:white;color:#0f172a;display:grid;place-items:center;text-decoration:none;font-size:19px";
    if (profile) profile.before(quick); else topbar.appendChild(quick);
  }

  if (!sidebar || !topbar || document.getElementById("dashboardMobileMenu")) return;
  const menu = document.createElement("button");
  menu.id = "dashboardMobileMenu"; menu.className = "mobile-menu-btn"; menu.type = "button";
  menu.setAttribute("aria-label", "Open navigation"); menu.innerHTML = '<i class="ph ph-list"></i>';
  topbar.prepend(menu);
  const backdrop = document.createElement("div"); backdrop.className = "mobile-sidebar-backdrop"; document.body.appendChild(backdrop);
  const close = () => {sidebar.classList.remove("mobile-open");backdrop.classList.remove("active");menu.innerHTML='<i class="ph ph-list"></i>';};
  menu.addEventListener("click",()=>{const open=!sidebar.classList.contains("mobile-open");sidebar.classList.toggle("mobile-open",open);backdrop.classList.toggle("active",open);menu.innerHTML=open?'<i class="ph ph-x"></i>':'<i class="ph ph-list"></i>';});
  backdrop.addEventListener("click",close); sidebar.querySelectorAll("a").forEach((a)=>a.addEventListener("click",close));
  window.addEventListener("resize",()=>{if(window.innerWidth>760)close();});
}