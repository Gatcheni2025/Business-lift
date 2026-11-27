const path=require('node:path');
const {connect}=require('./firebase-client.cjs'),{patch,rollback}=require('./hosting-patch.cjs');
async function main(){
 const action=process.argv[2];if(!['deploy','rollback'].includes(action))throw Error('Use deploy or rollback.');
 const client=await connect(),backupPath=path.resolve(__dirname,'../../hosting-backup-app-first.json');
 if(action==='deploy')await patch({client,root:path.resolve(__dirname,'../../public'),backupPath});
 else await rollback({client,backupPath});
}
if(require.main===module)main().catch(error=>{console.error('Website update stopped:',error.message);process.exitCode=1;});
module.exports={main};
