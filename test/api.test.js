const request = require('supertest');
const { DateTime } = require('luxon');
const { app } = require('../src/app');
const { pool } = require('../src/config/database');
const { appTimeZone } = require('../src/config/environment');
const helpers = require('./helpers');

const today = () => DateTime.now().setZone(appTimeZone).toISODate();
const yesterday = () =>
  DateTime.now().setZone(appTimeZone).minus({ days: 1 }).toISODate();

afterAll(async () => {
  await pool.end();
});

describe('Authentication', () => {
  let company;
  let activeUser;
  let inactiveUser;

  beforeAll(async () => {
    company = await helpers.seedCompany('Auth Test Co');
    activeUser = await helpers.seedUser({
      companyId: company.company_id,
      email: 'active@test.com',
      name: 'Active User',
      roleName: 'Accountant',
      accessTypeName: 'Read-Write',
    });
    inactiveUser = await helpers.seedUser({
      companyId: company.company_id,
      email: 'inactive@test.com',
      name: 'Inactive User',
      isActive: false,
    });
  });

  test('login succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'active@test.com', password: helpers.PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe('active@test.com');
    expect(res.body.data.user.name).toBe('Active User');
    expect(res.body.data.user.role).toBe('Accountant');
    expect(res.body.data.user.level).toBe('Level 1');
    expect(res.body.data.user.accessType).toBe('Read-Write');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.companies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ companyId: company.company_id }),
      ])
    );
  });

  test('login fails with invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'active@test.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  test('login fails for inactive user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.com', password: helpers.PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('ACCOUNT_INACTIVE');
  });

  test('login fails for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'missing@test.com', password: helpers.PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  test('login rejects missing body fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'active@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  test('login rejects an invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: helpers.PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe('JWT middleware', () => {
  let user;
  let token;

  beforeAll(async () => {
    const company = await helpers.seedCompany('JWT Co');
    user = await helpers.seedUser({ companyId: company.company_id, email: 'jwt@test.com' });
    token = helpers.tokenFor(user.user_id, user.email);
  });

  test('rejects request without token', async () => {
    const res = await request(app).get('/api/companies');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  test('rejects invalid JWT', async () => {
    const res = await request(app).get('/api/companies').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });

  test('rejects JWT signed with a different secret', async () => {
    const res = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${helpers.tokenFor(user.user_id, user.email)}x`);
    expect(res.status).toBe(401);
  });

  test('returns accessible companies for a valid token', async () => {
    const res = await request(app).get('/api/companies').set(helpers.auth(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Authorization: company isolation', () => {
  let companyA;
  let companyB;
  let userA;
  let viewerB;
  let tokenA;
  let tokenB;
  let voucherA;

  beforeAll(async () => {
    companyA = await helpers.seedCompany('Isolation Co A');
    companyB = await helpers.seedCompany('Isolation Co B');
    userA = await helpers.seedUser({
      companyId: companyA.company_id,
      email: 'usera@test.com',
      roleName: 'Accountant',
      accessTypeName: 'Read-Write',
    });
    viewerB = await helpers.seedUser({
      companyId: companyB.company_id,
      email: 'viewerb@test.com',
      roleName: 'Viewer',
      accessTypeName: 'Read-Only',
    });
    tokenA = helpers.tokenFor(userA.user_id, userA.email);
    tokenB = helpers.tokenFor(viewerB.user_id, viewerB.email);

    const ledgerA = await helpers.seedLedger(companyA.company_id, 'Isolation Party');
    voucherA = await helpers.seedVoucher({
      companyId: companyA.company_id,
      partyLedgerId: ledgerA.ledger_id,
    });
  });

  test('user cannot access another company summary', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyA.company_id}/vouchers/summary`)
      .set(helpers.auth(tokenB));
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });

  test('user cannot list another company vouchers', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyA.company_id}/vouchers?status=PENDING`)
      .set(helpers.auth(tokenB));
    expect(res.status).toBe(403);
  });

  test('user cannot view a voucher from another company', async () => {
    const res = await request(app)
      .get(`/api/vouchers/${voucherA.voucher_id}`)
      .set(helpers.auth(tokenB));
    expect(res.status).toBe(403);
  });

  test('viewer cannot accept a voucher (no approval permission)', async () => {
    const res = await request(app)
      .post(`/api/vouchers/${voucherA.voucher_id}/accept`)
      .set(helpers.auth(tokenB))
      .send({ remark: 'should not be allowed' });
    expect(res.status).toBe(403);
  });

  test('user can access their own company summary', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyA.company_id}/vouchers/summary`)
      .set(helpers.auth(tokenA));
    expect(res.status).toBe(200);
  });
});

describe('Voucher summary', () => {
  let company;
  let user;
  let token;

  beforeAll(async () => {
    company = await helpers.seedCompany('Summary Co');
    user = await helpers.seedUser({ companyId: company.company_id, email: 'summary@test.com' });
    token = helpers.tokenFor(user.user_id, user.email);

    const ledger = await helpers.seedLedger(company.company_id, 'Summary Party');
    await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id, status: 'PENDING' });
    await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id, status: 'PENDING' });
    await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id, status: 'ACCEPTED' });
    await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id, status: 'REJECTED' });
  });

  test('returns counts grouped by status for today', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers/summary`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.companyId).toBe(company.company_id);
    expect(res.body.data.date).toBe(today());
    expect(res.body.data.counts).toEqual({
      PENDING: 2,
      ACCEPTED: 1,
      REJECTED: 1,
    });
  });

  test('supports explicit date query', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers/summary?date=${today()}`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe(today());
    expect(res.body.data.counts).toEqual({
      PENDING: 2,
      ACCEPTED: 1,
      REJECTED: 1,
    });
  });

  test('returns zero counts for a day without vouchers', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers/summary?date=${yesterday()}`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.counts).toEqual({ PENDING: 0, ACCEPTED: 0, REJECTED: 0 });
  });

  test('rejects malformed or invalid dates', async () => {
    const badDate = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers/summary?date=2026-13-40`)
      .set(helpers.auth(token));
    expect(badDate.status).toBe(400);
    expect(badDate.body.errorCode).toBe('VALIDATION_ERROR');

    const badFormat = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers/summary?date=today`)
      .set(helpers.auth(token));
    expect(badFormat.status).toBe(400);
  });

  test('rejects a non-numeric companyId', async () => {
    const res = await request(app)
      .get('/api/companies/abc/vouchers/summary')
      .set(helpers.auth(token));
    expect(res.status).toBe(400);
  });
});

describe('Voucher list', () => {
  let company;
  let user;
  let token;

  beforeAll(async () => {
    company = await helpers.seedCompany('List Co');
    user = await helpers.seedUser({ companyId: company.company_id, email: 'list@test.com' });
    token = helpers.tokenFor(user.user_id, user.email);

    const alpha = await helpers.seedLedger(company.company_id, 'Alpha Traders');
    const beta = await helpers.seedLedger(company.company_id, 'Beta Suppliers');

    for (let i = 0; i < 3; i += 1) {
      await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: alpha.ledger_id, status: 'PENDING', totalAmount: 100 * (i + 1) });
    }
    await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: beta.ledger_id, status: 'ACCEPTED' });
  });

  test('lists pending vouchers with company + status filter', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?status=PENDING`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(1);
    for (const item of res.body.data) {
      expect(item.status).toBe('PENDING');
      expect(item.voucherNumber).toBeDefined();
      expect(typeof item.amount).toBe('number');
      expect(item.partyLedgerName).toBe('Alpha Traders');
    }
  });

  test('paginates results', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?status=PENDING&page=1&limit=2`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  test('filters by date', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?date=${today()}`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(4);
  });

  test('filters by inclusive date range', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?from=${yesterday()}&to=${today()}`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(4);
  });

  test('rejects a single-sided date range', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?from=${today()}`)
      .set(helpers.auth(token));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  test('rejects an inverted date range', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?from=${today()}&to=${yesterday()}`)
      .set(helpers.auth(token));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  test('searches by party ledger name', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?search=Beta`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].partyLedgerName).toBe('Beta Suppliers');
  });

  test('rejects an unknown status', async () => {
    const res = await request(app)
      .get(`/api/companies/${company.company_id}/vouchers?status=DRAFT`)
      .set(helpers.auth(token));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe('Voucher detail', () => {
  let company;
  let user;
  let token;
  let voucher;
  let partyLedger;
  let otherLedger;

  beforeAll(async () => {
    company = await helpers.seedCompany('Detail Co');
    user = await helpers.seedUser({ companyId: company.company_id, email: 'detail@test.com' });
    token = helpers.tokenFor(user.user_id, user.email);

    partyLedger = await helpers.seedLedger(company.company_id, 'Detail Party');
    otherLedger = await helpers.seedLedger(company.company_id, 'Detail Ledger');
    const item = await helpers.seedStockItem(company.company_id, 'Detail Product');

    voucher = await helpers.seedVoucher({
      companyId: company.company_id,
      partyLedgerId: partyLedger.ledger_id,
      totalAmount: 9500,
    });
    await helpers.seedInventoryEntry({
      voucherId: voucher.voucher_id,
      stockItemId: item.stock_item_id,
      qty: 10,
      rate: 1000,
      amount: 9500,
    });
    await helpers.seedLedgerEntry({
      voucherId: voucher.voucher_id,
      ledgerId: partyLedger.ledger_id,
      amount: 9500,
      entryType: 'DR',
    });
    await helpers.seedLedgerEntry({
      voucherId: voucher.voucher_id,
      ledgerId: otherLedger.ledger_id,
      amount: 9500,
      entryType: 'CR',
    });
  });

  test('returns full voucher detail with header, inventory and ledgers', async () => {
    const res = await request(app)
      .get(`/api/vouchers/${voucher.voucher_id}`)
      .set(helpers.auth(token));

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.voucherId).toBe(voucher.voucher_id);
    expect(data.voucherType).toBe('Sales');
    expect(data.partyLedger).toEqual({
      ledgerId: partyLedger.ledger_id,
      ledgerName: 'Detail Party',
    });
    expect(data.status).toBe('PENDING');
    expect(data.totalAmount).toBe(9500);
    expect(data.createdAt).toBeDefined();
    expect(data.inventoryEntries).toHaveLength(1);
    expect(data.inventoryEntries[0]).toMatchObject({
      stockItemName: 'Detail Product',
      qty: 10,
      rate: 1000,
      amount: 9500,
    });
    expect(data.ledgerEntries).toHaveLength(2);
    const dr = data.ledgerEntries.find((e) => e.entryType === 'DR');
    const cr = data.ledgerEntries.find((e) => e.entryType === 'CR');
    expect(dr).toMatchObject({ ledgerName: 'Detail Party', amount: 9500 });
    expect(cr).toMatchObject({ ledgerName: 'Detail Ledger', amount: 9500 });
  });

  test('returns 404 for a non-existent voucher', async () => {
    const res = await request(app).get('/api/vouchers/999999').set(helpers.auth(token));
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('VOUCHER_NOT_FOUND');
  });

  test('rejects a non-numeric voucherId', async () => {
    const res = await request(app).get('/api/vouchers/abc').set(helpers.auth(token));
    expect(res.status).toBe(400);
  });
});

describe('Accept voucher', () => {
  let company;
  let user;
  let token;
  let voucher;
  let ledger;

  beforeAll(async () => {
    company = await helpers.seedCompany('Accept Co');
    user = await helpers.seedUser({ companyId: company.company_id, email: 'accept@test.com' });
    token = helpers.tokenFor(user.user_id, user.email);
    ledger = await helpers.seedLedger(company.company_id, 'Accept Party');
    voucher = await helpers.seedVoucher({
      companyId: company.company_id,
      partyLedgerId: ledger.ledger_id,
      status: 'PENDING',
    });
  });

  test('accepts a pending voucher with a valid remark', async () => {
    const res = await request(app)
      .post(`/api/vouchers/${voucher.voucher_id}/accept`)
      .set(helpers.auth(token))
      .send({ remark: 'Verified and approved.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      voucherId: voucher.voucher_id,
      voucherNumber: voucher.voucher_number,
      status: 'ACCEPTED',
      remark: 'Verified and approved.',
    });

    const row = await helpers.query(
      'SELECT status, remark FROM vouchers WHERE voucher_id = $1',
      [voucher.voucher_id]
    );
    expect(row.rows[0].status).toBe('ACCEPTED');
    expect(row.rows[0].remark).toBe('Verified and approved.');

    const history = await helpers.query(
      'SELECT old_status, new_status, remark, changed_by FROM voucher_status_history WHERE voucher_id = $1',
      [voucher.voucher_id]
    );
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]).toMatchObject({
      old_status: 'PENDING',
      new_status: 'ACCEPTED',
      remark: 'Verified and approved.',
      changed_by: user.user_id,
    });
  });

  test('rejects missing remark', async () => {
    const v = await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id });
    const res = await request(app)
      .post(`/api/vouchers/${v.voucher_id}/accept`)
      .set(helpers.auth(token))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  test('rejects empty-string remark', async () => {
    const v = await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id });
    const res = await request(app)
      .post(`/api/vouchers/${v.voucher_id}/accept`)
      .set(helpers.auth(token))
      .send({ remark: '' });
    expect(res.status).toBe(400);
  });

  test('rejects whitespace-only remark', async () => {
    const v = await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id });
    const res = await request(app)
      .post(`/api/vouchers/${v.voucher_id}/accept`)
      .set(helpers.auth(token))
      .send({ remark: '   ' });
    expect(res.status).toBe(400);
  });

  test('rejects accepting an already accepted voucher', async () => {
    const res = await request(app)
      .post(`/api/vouchers/${voucher.voucher_id}/accept`)
      .set(helpers.auth(token))
      .send({ remark: 'Second attempt' });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('VOUCHER_ALREADY_PROCESSED');
    expect(res.body.message).toBe('Voucher has already been processed.');
  });

  test('rejects accepting a rejected voucher', async () => {
    const rejected = await helpers.seedVoucher({
      companyId: company.company_id,
      partyLedgerId: ledger.ledger_id,
      status: 'REJECTED',
    });
    const res = await request(app)
      .post(`/api/vouchers/${rejected.voucher_id}/accept`)
      .set(helpers.auth(token))
      .send({ remark: 'Late accept attempt' });
    expect(res.status).toBe(409);
  });

  test('returns 404 for a non-existent voucher', async () => {
    const res = await request(app)
      .post('/api/vouchers/999999/accept')
      .set(helpers.auth(token))
      .send({ remark: 'Nope' });
    expect(res.status).toBe(404);
  });
});

describe('Reject voucher', () => {
  let company;
  let user;
  let token;
  let voucher;
  let ledger;

  beforeAll(async () => {
    company = await helpers.seedCompany('Reject Co');
    user = await helpers.seedUser({ companyId: company.company_id, email: 'reject@test.com' });
    token = helpers.tokenFor(user.user_id, user.email);
    ledger = await helpers.seedLedger(company.company_id, 'Reject Party');
    voucher = await helpers.seedVoucher({
      companyId: company.company_id,
      partyLedgerId: ledger.ledger_id,
      status: 'PENDING',
    });
  });

  test('rejects a pending voucher with a valid remark', async () => {
    const res = await request(app)
      .post(`/api/vouchers/${voucher.voucher_id}/reject`)
      .set(helpers.auth(token))
      .send({ remark: 'Incorrect party ledger selected.' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      voucherId: voucher.voucher_id,
      status: 'REJECTED',
      remark: 'Incorrect party ledger selected.',
    });

    const row = await helpers.query(
      'SELECT status, remark FROM vouchers WHERE voucher_id = $1',
      [voucher.voucher_id]
    );
    expect(row.rows[0].status).toBe('REJECTED');
    expect(row.rows[0].remark).toBe('Incorrect party ledger selected.');

    const history = await helpers.query(
      'SELECT old_status, new_status FROM voucher_status_history WHERE voucher_id = $1',
      [voucher.voucher_id]
    );
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]).toMatchObject({ old_status: 'PENDING', new_status: 'REJECTED' });
  });

  test('rejects missing remark', async () => {
    const v = await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id });
    const res = await request(app)
      .post(`/api/vouchers/${v.voucher_id}/reject`)
      .set(helpers.auth(token))
      .send({});
    expect(res.status).toBe(400);
  });

  test('rejects whitespace-only remark', async () => {
    const v = await helpers.seedVoucher({ companyId: company.company_id, partyLedgerId: ledger.ledger_id });
    const res = await request(app)
      .post(`/api/vouchers/${v.voucher_id}/reject`)
      .set(helpers.auth(token))
      .send({ remark: '   ' });
    expect(res.status).toBe(400);
  });

  test('rejects processing an already-processed voucher', async () => {
    const res = await request(app)
      .post(`/api/vouchers/${voucher.voucher_id}/reject`)
      .set(helpers.auth(token))
      .send({ remark: 'Try again' });
    expect(res.status).toBe(409);
  });
});

describe('Concurrency safety', () => {
  let company;
  let user;
  let token;
  let ledger;

  beforeAll(async () => {
    company = await helpers.seedCompany('Race Co');
    user = await helpers.seedUser({ companyId: company.company_id, email: 'race@test.com' });
    token = helpers.tokenFor(user.user_id, user.email);
    ledger = await helpers.seedLedger(company.company_id, 'Race Party');
  });

  test('only one of two concurrent accepts succeeds', async () => {
    const voucher = await helpers.seedVoucher({
      companyId: company.company_id,
      partyLedgerId: ledger.ledger_id,
      status: 'PENDING',
    });

    const attempts = await Promise.allSettled([
      request(app)
        .post(`/api/vouchers/${voucher.voucher_id}/accept`)
        .set(helpers.auth(token))
        .send({ remark: 'First approver' }),
      request(app)
        .post(`/api/vouchers/${voucher.voucher_id}/accept`)
        .set(helpers.auth(token))
        .send({ remark: 'Second approver' }),
    ]);

    const statuses = attempts.map((a) => a.value.status).sort();
    expect(statuses).toEqual([200, 409]);

    const row = await helpers.query(
      'SELECT status FROM vouchers WHERE voucher_id = $1',
      [voucher.voucher_id]
    );
    expect(row.rows[0].status).toBe('ACCEPTED');

    const history = await helpers.query(
      'SELECT COUNT(*)::int AS n FROM voucher_status_history WHERE voucher_id = $1',
      [voucher.voucher_id]
    );
    expect(history.rows[0].n).toBe(1);
  });
});