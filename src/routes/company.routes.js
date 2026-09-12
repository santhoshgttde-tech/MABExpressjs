const router = require('express').Router();
const { authenticateJWT } = require('../middleware/auth.middleware');
const companyController = require('../controllers/company.controller');

/**
 * @swagger
 * /api/companies:
 *   get:
 *     summary: List companies accessible to the authenticated user
 *     description: Returns the companies the JWT user may operate on. Derived server-side from the user's permissions, never from client input.
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: List of accessible companies
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
 *                     $ref: '#/components/schemas/Company'
 *       '401':
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/companies', authenticateJWT, companyController.listCompanies);

module.exports = router;