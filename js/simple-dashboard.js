
(() => {
 const tabs=[...document.querySelectorAll('[data-home-tab]')];
 function select(tab){tabs.forEach(item=>{const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;});document.querySelectorAll('[data-home-panel]').forEach(panel=>panel.hidden=panel.dataset.homePanel!==tab.dataset.homeTab);}
 tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>select(tab));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];select(next);next.focus();});});
})();
