const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  return sendSuccess(res, data, 'Login successful');
});

module.exports = { login };