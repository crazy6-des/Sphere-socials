import { strict as assert } from 'node:assert';
import { handlePr2HardenedRequest } from './pr2Hardened';

type Row = Record<string, any>;
class FakeStatement { constructor(private db: FakeDb, private sql: string, private params: any[]) {} bind(...p:any[]){return new FakeStatement(this.db,this.sql,p)} async first(){return this.db.first(this.sql,this.params)} async all(){return {results:this.db.all(this.sql,this.params)}} async run(){return this.db.run(this.sql,this.params)} }
class FakeDb {
 users:Row[]=[{id:'CPA_TEST_USER_001'}]; wallets:Row[]=[{id:'wallet_test',user_id:'CPA_TEST_USER_001',balance:0,total_earned:0}]; events:Row[]=[]; transactions:Row[]=[];
 prepare(sql:string){return new FakeStatement(this,sql,[])}
 async first(sql:string,p:any[]){if(sql.includes('FROM users'))return this.users.find(x=>x.id===p[0])??null;if(sql.includes('FROM wallets'))return this.wallets.find(x=>x.user_id===p[0])??null;if(sql.includes('FROM reward_events'))return this.events.find(x=>x.provider===p[0]&&x.external_conversion_id===p[1])??null;return null}
 all(sql:string,p:any[]){return sql.includes('FROM transactions')?this.transactions.filter(x=>x.user_id===p[0]):[]}
 async run(sql:string,p:any[]){
  if(sql.startsWith('INSERT OR IGNORE INTO reward_events')){if(this.events.some(x=>x.provider===p[1]&&x.external_conversion_id===p[2]))return{success:true,meta:{changes:0}};this.events.push({id:p[0],provider:p[1],external_conversion_id:p[2],external_user_id:p[3],external_offer_id:p[4],payout:p[5],currency:p[6],status:p[7],raw_payload_hash:p[8],occurred_at:p[9],created_at:p[10]});return{success:true,meta:{changes:1}}}
  if(sql.startsWith('INSERT INTO transactions')){const ref=p[6];if(this.transactions.some(x=>x.reference_id===ref))return{success:true,meta:{changes:0}};const e=this.events.find(x=>x.provider===p[8]&&x.external_conversion_id===p[9]);if(!e)return{success:true,meta:{changes:0}};const isReversal=String(p[5]).toLowerCase().includes('reversal');if(!isReversal&&e.status!=='pending')return{success:true,meta:{changes:0}};if(isReversal&&e.status!=='credited')return{success:true,meta:{changes:0}};this.transactions.push({id:p[0],wallet_id:p[1],user_id:p[2],amount:p[3],provider:p[4],description:p[5],reference_id:ref,status:isReversal?'cancelled':'completed'});return{success:true,meta:{changes:1}}}
  if(sql.startsWith('UPDATE wallets SET balance = balance +')){const w=this.wallets.find(x=>x.user_id===p[3]);if(!w)return{success:true,meta:{changes:0}};if(!this.transactions.some(x=>x.reference_id===p[4]&&x.status==='completed'))return{success:true,meta:{changes:0}};if(!this.events.some(x=>x.provider===p[5]&&x.external_conversion_id===p[6]&&x.status==='pending'))return{success:true,meta:{changes:0}};w.balance+=p[0];w.total_earned+=p[1];return{success:true,meta:{changes:1}}}
  if(sql.startsWith('UPDATE wallets SET balance = balance -')){const w=this.wallets.find(x=>x.user_id===p[2]);if(!w||w.balance<p[0])return{success:true,meta:{changes:0}};if(!this.transactions.some(x=>x.reference_id===p[4]&&x.status==='cancelled'))return{success:true,meta:{changes:0}};if(!this.events.some(x=>x.provider===p[5]&&x.external_conversion_id===p[6]&&x.status==='credited'))return{success:true,meta:{changes:0}};w.balance-=p[0];return{success:true,meta:{changes:1}}}
  if(sql.startsWith("UPDATE reward_events SET status = 'credited'")){const e=this.events.find(x=>x.provider===p[2]&&x.external_conversion_id===p[3]&&x.status==='pending');const tx=this.transactions.find(x=>x.reference_id===p[0]&&x.status==='completed');if(!e||!tx)return{success:true,meta:{changes:0}};e.status='credited';e.transaction_id=tx.id;return{success:true,meta:{changes:1}}}
  if(sql.startsWith("UPDATE reward_events SET status = 'reversed'")){const e=this.events.find(x=>x.provider===p[1]&&x.external_conversion_id===p[2]&&x.status==='credited');const tx=this.transactions.find(x=>x.reference_id===p[3]&&x.status==='cancelled');if(!e||!tx)return{success:true,meta:{changes:0}};e.status='reversed';return{success:true,meta:{changes:1}}}
  return{success:true,meta:{changes:0}}
 }
 async batch(s:FakeStatement[]){const out=[];for(const x of s)out.push(await x.run());return out}
}
async function call(db:FakeDb,payload:Record<string,string>,env:Record<string,string>){const requestBody=new URLSearchParams(payload).toString();return handlePr2HardenedRequest(new Request('https://isolated.test/api/earn/postback/cpalead',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:requestBody}),env,db as any)}
async function getCall(db:FakeDb,payload:Record<string,string>,env:Record<string,string>){const query=new URLSearchParams(payload);return handlePr2HardenedRequest(new Request(`https://isolated.test/api/earn/postback/cpalead?${query}`,{method:'GET'}),env,db as any)}
async function body(response:Response){return await response.json() as any}
async function main(){
 const env={CPALEAD_POSTBACK_PASSWORD:'test-secret',REWARD_USER_SHARE_PERCENT:'75'};const db=new FakeDb();const valid={subid:'CPA_TEST_USER_001',lead_id:'TEST_LEAD_001',campaign_id:'CAMP_001',campaign_name:'Test Campaign',payout:'1.00',password:'test-secret'};
 const getRejected=await getCall(db,valid,env);assert.equal(getRejected.status,405);assert.equal(db.wallets[0].balance,0);
 const badPassword=await call(db,{...valid,password:'wrong'},env);assert.ok(badPassword.status>=400&&badPassword.status<500);assert.equal(db.wallets[0].balance,0);
 const missingId=await call(db,{...valid,lead_id:''},env);assert.ok(missingId.status>=400&&missingId.status<500);assert.equal(db.wallets[0].balance,0);
 const unknownUser=await call(db,{...valid,subid:'UNKNOWN_USER'},env);assert.ok(unknownUser.status>=400&&unknownUser.status<500);assert.equal(db.wallets[0].balance,0);
 const credited=await call(db,valid,env);const creditedJson=await body(credited);assert.ok(credited.status>=200&&credited.status<300);assert.equal(creditedJson.success,true);assert.equal(db.wallets[0].balance,0.75);assert.equal(db.wallets[0].total_earned,0.75);assert.equal(db.events[0].status,'credited');assert.equal(db.transactions.length,1);
 const duplicate=await call(db,valid,env);const duplicateJson=await body(duplicate);assert.ok(duplicate.status>=200&&duplicate.status<300);assert.equal(duplicateJson.duplicate,true);assert.equal(db.wallets[0].balance,0.75);assert.equal(db.transactions.length,1);
 const reversal=await call(db,{...valid,status:'reversed'},env);const reversalJson=await body(reversal);assert.ok(reversal.status>=200&&reversal.status<300);assert.equal(reversalJson.success,true);assert.equal(db.wallets[0].balance,0);assert.equal(db.events[0].status,'reversed');assert.equal(db.transactions.length,2);
 const reversalDuplicate=await call(db,{...valid,status:'reversed'},env);assert.ok(reversalDuplicate.status>=400&&reversalDuplicate.status<500);assert.equal(db.wallets[0].balance,0);assert.equal(db.transactions.length,2);
 console.log('CPAlead isolated handler tests passed: POST contract, GET rejection, bad secret, missing ID, unknown user, credit, 75/25 split, duplicate retry, reversal, safe reversal retry');
}
main().catch(e=>{console.error(e);process.exitCode=1});
