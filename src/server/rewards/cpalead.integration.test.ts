import { strict as assert } from 'node:assert';
import { normalizeProviderForTest, rewardCreditForTest } from './cpaleadTestHarness';

type Row = Record<string, any>;

class FakeStatement {
  constructor(private db: FakeDb, private sql: string, private params: any[]) {}
  bind(...params: any[]) { return new FakeStatement(this.db, this.sql, params); }
  async first() { return this.db.first(this.sql, this.params); }
  async all() { return { results: this.db.all(this.sql, this.params) }; }
  async run() { return this.db.run(this.sql, this.params); }
}

class FakeDb {
  users: Row[] = [{ id: 'CPA_TEST_USER_001' }];
  wallets: Row[] = [{ user_id: 'CPA_TEST_USER_001', balance: 0, total_earned: 0 }];
  events: Row[] = [];
  transactions: Row[] = [];
  prepare(sql: string) { return new FakeStatement(this, sql, []); }
  async first(sql: string, p: any[]) {
    if (sql.includes('FROM users')) return this.users.find(x => x.id === p[0]) ?? null;
    if (sql.includes('FROM wallets')) return this.wallets.find(x => x.user_id === p[0]) ?? null;
    if (sql.includes('FROM reward_events')) return this.events.find(x => x.provider === p[0] && x.external_conversion_id === p[1]) ?? null;
    return null;
  }
  all(sql: string, p: any[]) { return sql.includes('FROM transactions') ? this.transactions.filter(x => x.user_id === p[0]) : []; }
  async run(sql: string, p: any[]) {
    if (sql.startsWith('INSERT OR IGNORE INTO reward_events')) {
      if (this.events.some(x => x.provider === p[1] && x.external_conversion_id === p[2])) return { success: true, meta: { changes: 0 } };
      this.events.push({ id:p[0], provider:p[1], external_conversion_id:p[2], external_user_id:p[3], external_offer_id:p[4], payout:p[5], currency:p[6], status:p[7], raw_payload_hash:p[8], occurred_at:p[9], created_at:p[10] });
      return { success:true, meta:{changes:1} };
    }
    if (sql.startsWith('INSERT INTO transactions')) {
      const ref = p[6];
      if (this.transactions.some(x => x.reference_id === ref)) return { success:true, meta:{changes:0} };
      const event = this.events.find(x => x.provider === p[8] && x.external_conversion_id === p[9] && x.status === 'pending');
      if (!event) return { success:true, meta:{changes:0} };
      this.transactions.push({ id:p[0], wallet_id:p[1], user_id:p[2], amount:p[3], provider:p[4], description:p[5], reference_id:ref, status:'completed' });
      return { success:true, meta:{changes:1} };
    }
    if (sql.startsWith('UPDATE wallets SET balance = balance +')) {
      const wallet = this.wallets.find(x => x.user_id === p[3]);
      if (!wallet) return { success:true, meta:{changes:0} };
      const exists = this.transactions.some(x => x.reference_id === p[4] && x.status === 'completed');
      const pending = this.events.some(x => x.provider === p[5] && x.external_conversion_id === p[6] && x.status === 'pending');
      if (!exists || !pending) return { success:true, meta:{changes:0} };
      wallet.balance += p[0]; wallet.total_earned += p[1]; return { success:true, meta:{changes:1} };
    }
    if (sql.startsWith('UPDATE reward_events SET status = \'credited\'')) {
      const e = this.events.find(x => x.provider === p[2] && x.external_conversion_id === p[3] && x.status === 'pending');
      const tx = this.transactions.find(x => x.reference_id === p[0] && x.status === 'completed');
      if (!e || !tx) return { success:true, meta:{changes:0} };
      e.status='credited'; e.transaction_id=tx.id; return { success:true, meta:{changes:1} };
    }
    if (sql.startsWith('INSERT INTO transactions') && p.includes('cancelled')) return { success:true, meta:{changes:0} };
    return { success:true, meta:{changes:0} };
  }
  async batch(statements: FakeStatement[]) { const results=[]; for (const s of statements) results.push(await s.run()); return results; }
}

async function main() {
  const env = { CPALEAD_POSTBACK_PASSWORD:'test-secret', REWARD_USER_SHARE_PERCENT:'75' };
  const db:any = new FakeDb();
  const valid = { subid:'CPA_TEST_USER_001', lead_id:'TEST_LEAD_001', campaign_id:'CAMP_001', payout:'1.00', password:'test-secret' };
  assert.equal((await normalizeProviderForTest('cpalead', valid, env))?.externalConversionId, 'TEST_LEAD_001');
  assert.equal(await normalizeProviderForTest('cpalead', {...valid, password:'wrong'}, env), null);
  assert.equal(await normalizeProviderForTest('cpalead', {...valid, lead_id:''}, env), null);
  assert.equal(await normalizeProviderForTest('cpalead', {...valid, subid:'UNKNOWN'}, env) !== null, true);
  const conversion:any = await normalizeProviderForTest('cpalead', valid, env);
  assert.equal((await rewardCreditForTest(db, conversion, env)).state, 'credited');
  assert.equal(db.wallets[0].balance, 0.75);
  assert.equal((await rewardCreditForTest(db, conversion, env)).state, 'duplicate');
  assert.equal(db.wallets[0].balance, 0.75);
  console.log('CPAlead isolated tests passed: validation, credit, 75/25 split, duplicate protection');
}

main().catch(error => { console.error(error); process.exitCode=1; });
