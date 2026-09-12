const companyRepository = require('../repositories/company.repository');
const userRepository = require('../repositories/user.repository');

async function getUserCompanies(userId) {
  const companyIds = await userRepository.getCompanyIdsForUser(userId);
  return companyRepository.findManyByIds(companyIds).then((rows) =>
    rows.map((c) => ({ companyId: c.company_id, companyName: c.company_name }))
  );
}

async function findCompanyById(companyId) {
  return companyRepository.findById(companyId);
}

module.exports = { getUserCompanies, findCompanyById };