const { z } = require('zod');
const { VOUCHER_STATUSES } = require('../constants');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const dateSchema = z
  .string()
  .regex(DATE_REGEX, 'Invalid date. Expected YYYY-MM-DD.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    const valid = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    return valid;
  }, {
    message: 'Invalid calendar date.',
  });

const companyIdParamSchema = z.object({
  companyId: z.coerce.number().int().positive(),
});

const voucherIdParamSchema = z.object({
  voucherId: z.coerce.number().int().positive(),
});

const summaryQuerySchema = z.object({
  date: dateSchema.optional(),
});

const listQuerySchema = z.object({
  status: z.enum(VOUCHER_STATUSES).optional(),
  date: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

const fallbackBlank = (value) => {
  if (typeof value === 'string' && value.trim().length === 0) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const remarkBodySchema = z.object({
  remark: z
    .string({ required_error: 'Remark is mandatory.', invalid_type_error: 'Remark must be a string.' })
    .min(1, 'Remark is mandatory.')
    .max(2000, 'Remark must be at most 2000 characters.')
    .transform(fallbackBlank)
    .refine((value) => value !== undefined && value.length > 0, {
      message: 'Remark is mandatory.',
    }),
});

module.exports = {
  companyIdParamSchema,
  voucherIdParamSchema,
  summaryQuerySchema,
  listQuerySchema,
  remarkBodySchema,
  dateSchema,
};