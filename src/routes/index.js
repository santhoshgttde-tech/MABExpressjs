const express = require('express');
const authRoutes = require('./auth.routes');
const companyRoutes = require('./company.routes');
const voucherRoutes = require('./voucher.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/', companyRoutes);
router.use('/', voucherRoutes);

module.exports = router;