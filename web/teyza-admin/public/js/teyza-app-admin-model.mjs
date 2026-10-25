export class AdminError extends Error {
  constructor(message, status=0) { super(message); this.status=status; }
}

export const serviceUrl='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
export function createApi({user,fetcher=fetch}) {
  return async (action,data={})=>{
    const actor=user();
    if(!actor)throw new AdminError('Sign in with your authorised Teyza administrator account.',401);
    const token=await actor.getIdToken();
    const response=await fetcher(serviceUrl,{method:'POST',cache:'no-store',credentials:'omit',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,data})});
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.ok!==true)throw new AdminError(result?.error||'The review service could not respond. Please try again.',response.status);
    return result;
  };
}

// A reply from another account, seller or refresh must never become visible.
export class ReviewState {
  constructor(){this.generation=0;this.uid=null;this.clear();}
  clear(){this.generation++;this.rows=[];this.next=null;this.selected=null;this.views=new Map();}
  account(uid){this.clear();this.uid=uid;}
  select(row){this.generation++;this.selected=row;this.views.clear();}
  ticket(){return {uid:this.uid,generation:this.generation};}
  current(ticket){return ticket.uid===this.uid&&ticket.generation===this.generation;}
  viewed(kind,now=Date.now()){this.views.set(kind,now);}
  canApprove(now=Date.now()){
    const s=this.selected;
    return Boolean(s&&s.sellerUid!==this.uid&&!s.expired&&s.evidenceId&&
      ['identity','selfie'].every(k=>this.views.has(k)&&now-this.views.get(k)<300000));
  }
  decision(status,reason,now=Date.now()){
    const s=this.selected;
    if(!s||s.sellerUid===this.uid)throw new AdminError('Another administrator must review this shop.');
    if(!['approved','needs_new_photo','rejected'].includes(status))throw new AdminError('Choose a review decision.');
    if(status==='approved'&&!this.canApprove(now))throw new AdminError('Open and inspect the current identity document and selfie before approving.');
    const note=String(reason||'').trim();
    if(note.length>400||status!=='approved'&&!note)throw new AdminError('Write a clear review note, up to 400 characters, for the seller.');
    return {sellerUid:s.sellerUid,submissionId:s.submissionId,...(s.evidenceId?{evidenceId:s.evidenceId}:{}),status,reason:note};
  }
}

export function filteredRows(rows,search,category){
  const term=search.trim().toLocaleLowerCase();
  return rows.filter(s=>(category==='all'||s.category===category)&&
    [s.shopName,s.ownerEmail,s.phone,s.address].some(v=>String(v||'').toLocaleLowerCase().includes(term)));
}
export function photoBlob(base64){
  if(typeof base64!=='string'||base64.length>6000000)throw new AdminError('This verification photo could not be read.');
  let bytes;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch(_){throw new AdminError('This verification photo could not be read.');}
  if(bytes.length<3||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new AdminError('The service returned an unexpected image.');
  return new Blob([bytes],{type:'image/jpeg'});
}
