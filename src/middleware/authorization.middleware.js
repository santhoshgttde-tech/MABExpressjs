const { AppError } = require('../utils/AppError');
const { canApproveVoucher } = require('../constants');

function authorizeCompanyAccess(req, res, next) {
  const companyId = Number(req.params.companyId);
  if (!req.user || !req.user.companyIds.has(companyId)) {
    return next(new AppError(403, 'You do not have access to this company.', 'FORBIDDEN'));
  }
  return next();
}

function authorizeVoucherAction(req, res, next) {
  if (!req.user || !canApproveVoucher(req.user.roleName, req.user.accessTypeName)) {
    return next(
      new AppError(403, 'You do not have permission to approve or reject vouchers.', 'FORBIDDEN')
    );
  }
  return next();
}

module.exports = { authorizeCompanyAccess, authorizeVoucherAction };