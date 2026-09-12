const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/environment');
const { AppError } = require('../utils/AppError');
const userRepository = require('../repositories/user.repository');
const companyRepository = require('../repositories/company.repository');

async function login({ email, password }) {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    throw new AppError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    throw new AppError(401, 'Your account is inactive. Contact your administrator.', 'ACCOUNT_INACTIVE');
  }

  const companyIds = await userRepository.getCompanyIdsForUser(user.user_id);
  const companies = await companyRepository.findManyByIds(companyIds);

  const accessToken = jwt.sign(
    { sub: user.user_id, email: user.email },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );

  return {
    accessToken,
    user: {
      userId: user.user_id,
      name: user.full_name,
      email: user.email,
      role: user.role_name,
      level: user.level_name,
      accessType: user.access_type_name,
    },
    companies: companies.map((c) => ({
      companyId: c.company_id,
      companyName: c.company_name,
    })),
  };
}

async function getUserCompanies(userId) {
  const companyIds = await userRepository.getCompanyIdsForUser(userId);
  const companies = await companyRepository.findManyByIds(companyIds);
  return companies.map((c) => ({
    companyId: c.company_id,
    companyName: c.company_name,
  }));
}

module.exports = { login, getUserCompanies };