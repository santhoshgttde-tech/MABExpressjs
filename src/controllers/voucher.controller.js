const voucherService = require('../services/voucher.service');
const { sendSuccess } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');

const getSummary = asyncHandler(async (req, res) => {
  const data = await voucherService.getSummary({
    companyIds: req.user.companyIds,
    companyId: req.params.companyId,
    date: req.query.date,
  });
  return sendSuccess(res, data);
});

const listVouchers = asyncHandler(async (req, res) => {
  const data = await voucherService.listVouchers({
    companyIds: req.user.companyIds,
    companyId: req.params.companyId,
    query: req.query,
  });
  return res.status(200).json({
    success: true,
    message: 'Vouchers fetched successfully',
    data: data.data,
    pagination: data.pagination,
  });
});

const getVoucherDetail = asyncHandler(async (req, res) => {
  const data = await voucherService.getVoucherDetail({
    companyIds: req.user.companyIds,
    voucherId: req.params.voucherId,
  });
  return sendSuccess(res, data);
});

const acceptVoucher = asyncHandler(async (req, res) => {
  const data = await voucherService.acceptVoucher({
    userId: req.user.userId,
    companyIds: req.user.companyIds,
    voucherId: req.params.voucherId,
    remark: req.body.remark,
  });
  return sendSuccess(res, data, 'Voucher accepted successfully');
});

const rejectVoucher = asyncHandler(async (req, res) => {
  const data = await voucherService.rejectVoucher({
    userId: req.user.userId,
    companyIds: req.user.companyIds,
    voucherId: req.params.voucherId,
    remark: req.body.remark,
  });
  return sendSuccess(res, data, 'Voucher rejected successfully');
});

module.exports = {
  getSummary,
  listVouchers,
  getVoucherDetail,
  acceptVoucher,
  rejectVoucher,
};