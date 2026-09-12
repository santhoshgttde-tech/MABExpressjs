const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');

const listCompanies = asyncHandler(async (req, res) => {
  const companies = await authService.getUserCompanies(req.user.userId);
  return sendSuccess(res, companies);
});

module.exports = { listCompanies };