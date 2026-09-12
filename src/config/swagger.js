const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const { port, appTimeZone } = require('./environment');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Voucher Approval API',
      version: '1.0.0',
      description:
        'REST API for the voucher approval workflow of the General Accounting & ERP system. ' +
        'Business rules, authorization, status transitions, validation and database integrity are enforced by the backend. ' +
        `"Today" is computed in the configured application timezone (currently **${appTimeZone}**).`,
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Remark is mandatory.' },
            errorCode: { type: 'string', example: 'VALIDATION_ERROR' },
            details: {
              type: 'object',
              description: 'Field-level details for validation errors (optional).',
            },
          },
        },
        Company: {
          type: 'object',
          properties: {
            companyId: { type: 'integer' },
            companyName: { type: 'string' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', example: 'secret' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                userId: { type: 'integer' },
                name: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                level: { type: 'string' },
                accessType: { type: 'string' },
              },
            },
            companies: {
              type: 'array',
              items: { $ref: '#/components/schemas/Company' },
            },
          },
        },
        VoucherSummary: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date', example: '2026-09-12' },
            companyId: { type: 'integer' },
            counts: {
              type: 'object',
              properties: {
                PENDING: { type: 'integer', example: 25 },
                ACCEPTED: { type: 'integer', example: 40 },
                REJECTED: { type: 'integer', example: 5 },
              },
            },
          },
        },
        VoucherListItem: {
          type: 'object',
          properties: {
            voucherId: { type: 'integer' },
            voucherNumber: { type: 'string' },
            partyLedgerName: { type: 'string' },
            amount: { type: 'number' },
            status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        VoucherActionRequest: {
          type: 'object',
          required: ['remark'],
          properties: {
            remark: {
              type: 'string',
              minLength: 1,
              maxLength: 2000,
              example: 'Verified and approved.',
              description: 'Mandatory remark; whitespace-only values are rejected.',
            },
          },
        },
        VoucherActionResponse: {
          type: 'object',
          properties: {
            voucherId: { type: 'integer' },
            voucherNumber: { type: 'string' },
            status: { type: 'string', enum: ['ACCEPTED', 'REJECTED'] },
            remark: { type: 'string' },
          },
        },
        VoucherDetail: {
          type: 'object',
          properties: {
            voucherId: { type: 'integer' },
            voucherNumber: { type: 'string' },
            voucherType: { type: 'string' },
            partyLedger: {
              type: 'object',
              properties: {
                ledgerId: { type: 'integer' },
                ledgerName: { type: 'string' },
              },
            },
            billToAddress: { type: ['string', 'null'] },
            shipToAddress: { type: ['string', 'null'] },
            placeOfSupply: { type: ['string', 'null'] },
            costCenter: { type: ['string', 'null'] },
            totalAmount: { type: 'number' },
            narration: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] },
            remark: { type: ['string', 'null'] },
            createdByName: { type: ['string', 'null'] },
            createdAt: { type: 'string', format: 'date-time' },
            inventoryEntries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  stockItemId: { type: 'integer' },
                  stockItemName: { type: 'string' },
                  qty: { type: 'number' },
                  rate: { type: 'number' },
                  inclusiveRate: { type: 'number' },
                  discountPercentage: { type: 'number' },
                  amount: { type: 'number' },
                },
              },
            },
            ledgerEntries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ledgerId: { type: 'integer' },
                  ledgerName: { type: 'string' },
                  amount: { type: 'number' },
                  entryType: { type: 'string', enum: ['DR', 'CR'] },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '..', 'routes', '*.js').split(path.sep).join('/')],
};

const specs = swaggerJSDoc(options);

module.exports = { specs };