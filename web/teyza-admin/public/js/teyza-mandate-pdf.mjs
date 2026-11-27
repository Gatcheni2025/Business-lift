/* Private, browser-only seller mandate request PDF. No third-party SDK or network call.
 * This is NOT a Netcash-generated, DebiCheck-authenticated mandate. */
const latin=value=>String(value??'')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
const safe=value=>latin(value).replace(/[\\()]/g,'\\$&');
const wrap=(value,length=83)=>{
  const output=[],words=latin(value).split(/\s+/);let current='';
  for(const word of words){
    if(!word)continue;
    if(word.length>length){
      if(current){output.push(current);current='';}
      for(let i=0;i<word.length;i+=length)output.push(word.slice(i,i+length));
      continue;
    }
    if((current+' '+word).trim().length>length){
      output.push(current);current=word;
    }else current+=(current?' ':'')+word;
  }
  if(current)output.push(current);
  return output.length?output:[''];
};

export function buildMandateRequestPdf(info){
  const m=info?.mandate,details=info?.sensitive;
  if(!m?.mandateId||!m?.acceptedAt||!m?.terms||!details?.accountNumber)
    throw Error('The full, audited seller mandate has not been loaded.');
  if(m.status==='withdrawn')throw Error('A withdrawn mandate cannot be exported for collection.');
  const entries=[],add=(text='',bold=false)=>{
    for(const part of wrap(text))entries.push({text:part,bold});
  };
  const gap=()=>entries.push({text:'',bold:false});
  add('TEYZA | R99 MONTHLY DEBIT-ORDER MANDATE REQUEST',true);
  add('CONFIDENTIAL - PREPARATORY REQUEST; BANK/PROVIDER AUTHENTICATION PENDING',true);
  gap();
  add('Mandate reference: '+m.mandateId);
  add('Request status: '+String(m.status).replaceAll('_',' '));
  add('Recorded seller consent: '+new Date(m.acceptedAt).toISOString());
  add('Terms version: '+m.termsVersion);
  gap();
  add('A. SELLER / ACCOUNT HOLDER',true);
  add('Registered shop: '+(info.shopName||m.shopName||''));
  add('Shop address: '+(info.shopAddress||m.shopAddress||''));
  add('Shop email: '+(info.ownerEmail||''));
  add('Name: '+(details.firstName||'')+' '+(details.surname||''));
  add('Contact number: '+details.phone);
  add('Identity type: '+details.documentKind);
  add('ID or passport number: '+details.documentNumber);
  gap();
  add('B. REQUESTED BANK ACCOUNT',true);
  add('Bank: '+m.bankName);
  add('Universal/branch code: '+m.branchCode);
  add('Account holder / authorised signatory: '+details.accountHolder);
  add('Bank account number: '+details.accountNumber);
  add('Account type: '+details.accountType);
  gap();
  add('C. PROPOSED COLLECTION TERMS',true);
  add('Mandate amount: ZAR 99.00 monthly (9,900 cents)');
  add('First requested debit date: '+m.firstDate);
  add('Recurring calendar day: '+m.collectionDay);
  add('Collection provider: not yet activated by Teyza');
  gap();
  add('D. SELLER ELECTRONIC CONSENT RECEIPT',true);
  add('Consent was recorded online under the seller account at the time above.');
  add('The seller accepted the indicated exact amount, proposed dates, bank account');
  add('and consent to use existing identity evidence for private verification.');
  add('Recorded consent text:');
  for(const line of wrap(m.terms,82))entries.push({text:line,bold:false});
  gap();
  add('E. PROVIDER INSTRUCTIONS / LIMITATIONS',true);
  add('No debit instruction has been sent and no paid membership is activated.');
  add('Bank account ownership and the applicable Netcash / DebiCheck or other');
  add('provider authentication process must be completed independently.');
  add('Netcash: a website checkbox is not a valid debit-order authorisation.');
  add('Obtain a signed paper mandate or provider-approved electronic mandate,');
  add('including any applicable DebiCheck bank authentication.');
  add('This preparatory record is not a bank-approved mandate and may not');
  add('satisfy the collection provider official mandate format on its own.');
  add('Use an approved secure provider portal to transmit this confidential PDF.');
  add('Do not distribute by unencrypted email or consumer messaging services.');
  const perPage=53;
  const chunks=[];
  for(let i=0;i<entries.length;i+=perPage)chunks.push(entries.slice(i,i+perPage));
  // All strings are ASCII for standard PDF Base-14 Courier fonts.
  // For names needing non-Latin scripts, use the provider's Unicode-capable
  // native mandate workflow to preserve spelling exactly.
  const objects=[null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>'
  ];
  const pageIds=[];
  for(let i=0;i<chunks.length;i++){
    const pageNo=objects.length,contentNo=pageNo+1;
    pageIds.push(pageNo);
    const commands=['BT /F2 12 Tf 42 807 Td (TEYZA MANDATE REQUEST - NOT BANK-AUTHENTICATED) Tj ET'];
    for(let row=0;row<chunks[i].length;row++){
      const entry=chunks[i][row],y=785-row*13.3;
      commands.push('BT /F'+(entry.bold?'2':'1')+' 9.4 Tf 43 '+y.toFixed(1)+
        ' Td ('+safe(entry.text)+') Tj ET');
    }
    commands.push('BT /F1 8 Tf 43 42 Td (CONFIDENTIAL  |  PAGE '+(i+1)+' OF '+chunks.length+
      '  |  PROVIDER APPROVAL REQUIRED) Tj ET');
    const stream=commands.join('\n')+'\n';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+contentNo+' 0 R >>');
    objects.push('<< /Length '+new TextEncoder().encode(stream).length+' >>\nstream\n'+stream+'endstream');
  }
  objects[2]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+chunks.length+' >>';
  let source='%PDF-1.4\n%TEYZA\n',offsets=[0];
  for(let i=1;i<objects.length;i++){
    offsets[i]=new TextEncoder().encode(source).length;
    source+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const startXref=new TextEncoder().encode(source).length;
  source+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)source+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  source+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+startXref+'\n%%EOF\n';
  return new TextEncoder().encode(source);
}
export function downloadMandateRequestPdf(info){
  const data=buildMandateRequestPdf(info);
  const url=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));
  const anchor=document.createElement('a');
  const ref=String(info.mandate.mandateId).replace(/[^A-Za-z0-9_-]/g,'_');
  anchor.href=url;anchor.download='Teyza_R99_Mandate_Request_'+ref+'.pdf';
  anchor.style.display='none';
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
