const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address.').max(255),
  password: z.string().min(1, 'Password is required.').max(128),
});

module.exports = { loginSchema };