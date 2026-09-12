const VOUCHER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
});

const VOUCHER_STATUSES = Object.freeze(['PENDING', 'ACCEPTED', 'REJECTED']);

const ROLES = Object.freeze({
  ADMIN: 'Admin',
  ACCOUNTANT: 'Accountant',
  VIEWER: 'Viewer',
});

const ACCESS_TYPES = Object.freeze({
  READ_ONLY: 'Read-Only',
  READ_WRITE: 'Read-Write',
  FULL_CONTROL: 'Full-Control',
});

const WRITE_ACCESS_TYPES = Object.freeze([ACCESS_TYPES.READ_WRITE, ACCESS_TYPES.FULL_CONTROL]);

function canApproveVoucher(roleName, accessTypeName) {
  if (roleName === ROLES.ADMIN) return true;
  if (roleName === ROLES.ACCOUNTANT) return WRITE_ACCESS_TYPES.includes(accessTypeName);
  return false;
}

function canReadVoucher(roleName, accessTypeName) {
  return Boolean(roleName && accessTypeName);
}

module.exports = {
  VOUCHER_STATUS,
  VOUCHER_STATUSES,
  ROLES,
  ACCESS_TYPES,
  WRITE_ACCESS_TYPES,
  canApproveVoucher,
  canReadVoucher,
};