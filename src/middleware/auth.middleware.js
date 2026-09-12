const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/environment');
const { AppError } = require('../utils/AppError');
const userRepository = require('../repositories/user.repository');

async function authenticateJWT(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'Authentication required.', 'UNAUTHORIZED');
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtConfig.secret);
    } catch {
      throw new AppError(401, 'Invalid or expired token.', 'INVALID_TOKEN');
    }

    const user = await userRepository.findById(payload.sub);
    if (!user) {
      throw new AppError(401, 'Invalid or expired token.', 'INVALID_TOKEN');
    }
    if (!user.is_active) {
      throw new AppError(401, 'Your account is inactive. Contact your administrator.', 'ACCOUNT_INACTIVE');
    }

    const companyIds = await userRepository.getCompanyIdsForUser(user.user_id);

    req.user = {
      userId: user.user_id,
      name: user.full_name,
      email: user.email,
      roleName: user.role_name,
      levelName: user.level_name,
      accessTypeName: user.access_type_name,
      primaryCompanyId: user.company_id,
      companyIds: new Set(companyIds),
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticateJWT };