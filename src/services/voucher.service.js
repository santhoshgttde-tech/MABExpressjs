const { AppError } = require('../utils/AppError');
const { getDayBounds } = require('../utils/timezone');
const { withTransaction } = require('../config/database');
const { VOUCHER_STATUS } = require('../constants');
const voucherRepository = require('../repositories/voucher.repository');

function assertCompanyAccess(companyIds, companyId) {
  if (!companyIds.has(companyId)) {
    throw new AppError(403, 'You do not have access to this company.', 'FORBIDDEN');
  }
}

async function getSummary({ companyIds, companyId, date }) {
  assertCompanyAccess(companyIds, companyId);
  const bounds = getDayBounds(date);
  const rows = await voucherRepository.countStatusCounts(companyId, bounds.start, bounds.end);

  const counts = {
    [VOUCHER_STATUS.PENDING]: 0,
    [VOUCHER_STATUS.ACCEPTED]: 0,
    [VOUCHER_STATUS.REJECTED]: 0,
  };

  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = row.count;
    }
  }

  return {
    date: bounds.localDate,
    companyId,
    counts,
  };
}

async function listVouchers({ companyIds, companyId, query }) {
  assertCompanyAccess(companyIds, companyId);
  const bounds = getDayBounds(query.date);

  const { rows, total } = await voucherRepository.listVouchers({
    companyId,
    status: query.status,
    start: bounds.start,
    end: bounds.end,
    search: query.search,
    page: query.page,
    limit: query.limit,
  });

  return {
    data: rows.map((r) => ({
      voucherId: r.voucher_id,
      voucherNumber: r.voucher_number,
      partyLedgerName: r.party_ledger_name,
      amount: r.amount,
      status: r.status,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      hasNextPage: query.page * query.limit < total,
      hasPreviousPage: query.page > 1,
    },
  };
}

async function getVoucherDetail({ companyIds, voucherId }) {
  const voucher = await voucherRepository.findVoucherHeader(voucherId);
  if (!voucher) {
    throw new AppError(404, 'Voucher not found.', 'VOUCHER_NOT_FOUND');
  }
  assertCompanyAccess(companyIds, voucher.company_id);

  const [inventoryEntries, ledgerEntries] = await Promise.all([
    voucherRepository.findInventoryEntriesByVoucher(voucherId),
    voucherRepository.findLedgerEntriesByVoucher(voucherId),
  ]);

  return {
    voucherId: voucher.voucher_id,
    voucherNumber: voucher.voucher_number,
    voucherType: voucher.voucher_type,
    partyLedger: {
      ledgerId: voucher.party_ledger_id,
      ledgerName: voucher.party_ledger_name,
    },
    billToAddress: voucher.bill_to_address,
    shipToAddress: voucher.ship_to_address,
    placeOfSupply: voucher.place_of_supply,
    costCenter: voucher.cost_center,
    totalAmount: voucher.total_amount,
    narration: voucher.narration,
    status: voucher.status,
    remark: voucher.remark,
    createdByName: voucher.created_by_name,
    createdAt: voucher.created_at ? voucher.created_at.toISOString() : null,
    inventoryEntries: inventoryEntries.map((e) => ({
      stockItemId: e.stock_item_id,
      stockItemName: e.stock_item_name,
      qty: e.qty,
      rate: e.rate,
      inclusiveRate: e.inclusive_rate,
      discountPercentage: e.discount_percentage,
      amount: e.amount,
    })),
    ledgerEntries: ledgerEntries.map((e) => ({
      ledgerId: e.ledger_id,
      ledgerName: e.ledger_name,
      amount: e.amount,
      entryType: e.entry_type,
    })),
  };
}

async function processVoucher({ userId, companyIds, voucherId, remark, newStatus }) {
  return withTransaction(async (client) => {
    const voucher = await voucherRepository.findVoucherByIdForUpdate(client, voucherId);
    if (!voucher) {
      throw new AppError(404, 'Voucher not found.', 'VOUCHER_NOT_FOUND');
    }

    assertCompanyAccess(companyIds, voucher.company_id);

    if (voucher.status !== VOUCHER_STATUS.PENDING) {
      throw new AppError(409, 'Voucher has already been processed.', 'VOUCHER_ALREADY_PROCESSED');
    }

    const affected = await voucherRepository.updateStatus(
      client,
      voucherId,
      newStatus,
      remark,
      VOUCHER_STATUS.PENDING
    );
    if (affected !== 1) {
      throw new AppError(409, 'Voucher has already been processed.', 'VOUCHER_ALREADY_PROCESSED');
    }

    await voucherRepository.insertStatusHistory(client, {
      voucherId,
      oldStatus: VOUCHER_STATUS.PENDING,
      newStatus,
      remark,
      changedBy: userId,
    });

    return {
      voucherId,
      voucherNumber: voucher.voucher_number,
      status: newStatus,
      remark,
    };
  });
}

async function acceptVoucher({ userId, companyIds, voucherId, remark }) {
  return processVoucher({
    userId,
    companyIds,
    voucherId,
    remark,
    newStatus: VOUCHER_STATUS.ACCEPTED,
  });
}

async function rejectVoucher({ userId, companyIds, voucherId, remark }) {
  return processVoucher({
    userId,
    companyIds,
    voucherId,
    remark,
    newStatus: VOUCHER_STATUS.REJECTED,
  });
}

module.exports = {
  getSummary,
  listVouchers,
  getVoucherDetail,
  acceptVoucher,
  rejectVoucher,
};