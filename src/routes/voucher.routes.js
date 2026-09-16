const router = require('express').Router();
const { authenticateJWT } = require('../middleware/auth.middleware');
const {
  authorizeCompanyAccess,
  authorizeVoucherAction,
} = require('../middleware/authorization.middleware');
const { validate } = require('../middleware/validation.middleware');
const {
  companyIdParamSchema,
  voucherIdParamSchema,
  summaryQuerySchema,
  listQuerySchema,
  remarkBodySchema,
} = require('../validators/voucher.validator');
const voucherController = require('../controllers/voucher.controller');

router.use(authenticateJWT);

/**
 * @swagger
 * /api/companies/{companyId}/vouchers/summary:
 *   get:
 *     summary: Today's voucher status summary
 *     description: Returns voucher counts grouped by status for a company, for a given date (defaults to today in the configured application timezone).
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         example: '2026-09-12'
 *         description: Local business date in YYYY-MM-DD. Defaults to today in the configured timezone.
 *     responses:
 *       '200':
 *         description: Status counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VoucherSummary'
 *       '400':
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Company not accessible to the user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/companies/:companyId/vouchers/summary',
  validate(companyIdParamSchema, 'params'),
  validate(summaryQuerySchema, 'query'),
  authorizeCompanyAccess,
  voucherController.getSummary
);

/**
 * @swagger
 * /api/companies/{companyId}/vouchers:
 *   get:
 *     summary: List vouchers for a company
 *     description: Lightweight list with pagination, optional status filter, optional date filter and optional search by voucher number or party ledger name.
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PENDING, ACCEPTED, REJECTED]
 *         example: PENDING
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         example: '2026-09-12'
 *         description: Single local business date in YYYY-MM-DD. Mutually exclusive with from/to.
 *       - in: query
 *         name: from
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         example: '2026-09-01'
 *         description: Start of an inclusive date range (YYYY-MM-DD). Requires `to`.
 *       - in: query
 *         name: to
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         example: '2026-09-15'
 *         description: End of an inclusive date range (YYYY-MM-DD). Requires `from`.
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         example: INV-1001
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       '200':
 *         description: Paginated voucher list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VoucherListItem'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       '400':
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Company not accessible to the user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/companies/:companyId/vouchers',
  validate(companyIdParamSchema, 'params'),
  validate(listQuerySchema, 'query'),
  authorizeCompanyAccess,
  voucherController.listVouchers
);

/**
 * @swagger
 * /api/vouchers/{voucherId}:
 *   get:
 *     summary: Get complete voucher detail
 *     description: Returns the voucher header, inventory entries and ledger entries. The voucher company must be accessible to the user.
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 101
 *     responses:
 *       '200':
 *         description: Voucher detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VoucherDetail'
 *       '401':
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Voucher's company not accessible to the user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Voucher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/vouchers/:voucherId',
  validate(voucherIdParamSchema, 'params'),
  voucherController.getVoucherDetail
);

/**
 * @swagger
 * /api/vouchers/{voucherId}/accept:
 *   post:
 *     summary: Accept a voucher
 *     description: Transaction-safe acceptance. Sets status to ACCEPTED, stores the mandatory remark and writes an audit history row. Protected against concurrent processing.
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 101
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VoucherActionRequest'
 *     responses:
 *       '200':
 *         description: Voucher accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VoucherActionResponse'
 *       '400':
 *         description: Remark missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: No approval permission or no company access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Voucher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: Voucher already processed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/vouchers/:voucherId/accept',
  validate(voucherIdParamSchema, 'params'),
  validate(remarkBodySchema),
  authorizeVoucherAction,
  voucherController.acceptVoucher
);

/**
 * @swagger
 * /api/vouchers/{voucherId}/reject:
 *   post:
 *     summary: Reject a voucher
 *     description: Transaction-safe rejection. Sets status to REJECTED, stores the mandatory remark and writes an audit history row. Protected against concurrent processing.
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 101
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VoucherActionRequest'
 *     responses:
 *       '200':
 *         description: Voucher rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VoucherActionResponse'
 *       '400':
 *         description: Remark missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: No approval permission or no company access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Voucher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '409':
 *         description: Voucher already processed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/vouchers/:voucherId/reject',
  validate(voucherIdParamSchema, 'params'),
  validate(remarkBodySchema),
  authorizeVoucherAction,
  voucherController.rejectVoucher
);

module.exports = router;