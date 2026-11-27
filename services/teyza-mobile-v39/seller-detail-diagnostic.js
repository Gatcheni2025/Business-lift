'use strict';

// A bounded diagnostic for unexpected admin account-detail failures.
// Never log Firebase IDs, seller data, payments, request bodies, error messages,
// credentials, URLs, full absolute paths or arbitrary stack strings.
function sellerDetailDiagnostic(error,action) {
  const operation=action==='ops_seller_detail'?'ops_seller_detail':
    action==='seller_billing_statement'?'seller_billing_statement':'unrelated';
  const type=error?.name==='TypeError'?'TypeError':
    error?.name==='ReferenceError'?'ReferenceError':
    error?.name==='RangeError'?'RangeError':
    error?.name==='SyntaxError'?'SyntaxError':'Error';
  const stack=typeof error?.stack==='string'?error.stack.split(/\r?\n/).slice(1,12):[];
  const frames=[];
  for(const row of stack){
    const match=/(?:^|[/\\])([A-Za-z0-9._-]+\.(?:cjs|mjs|js)):(\d{1,6}):(\d{1,6})\)?$/.exec(row.trim());
    if(match){
      frames.push(match[1]+':'+match[2]+':'+match[3]);
      if(frames.length===5)break;
    }
  }
  return {operation,type,frames};
}
module.exports={sellerDetailDiagnostic};
