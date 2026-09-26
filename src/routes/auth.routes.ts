import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new customer
 *     description: |
 *       Creates a BVN/NIN identity on NIBSS, validates it, creates a NUBAN
 *       account (pre-funded with ₦15,000), and returns a JWT.
 *       The `kycId` must be a unique 11-digit number that is not already
 *       linked to an account on NIBSS.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - phone
 *               - dob
 *               - kycType
 *               - kycId
 *             properties:
 *               email: { type: string, format: email, example: 'test@vivaldigital.com' }
 *               password: { type: string, minLength: 8, example: 'SecurePass123' }
 *               firstName: { type: string, example: 'Test' }
 *               lastName: { type: string, example: 'Customer' }
 *               phone: { type: string, example: '08012345678' }
 *               dob: { type: string, example: '1995-06-15' }
 *               kycType: { type: string, enum: [BVN, NIN], example: 'BVN' }
 *               kycId: { type: string, example: '22233344455' }
 *     responses:
 *       201:
 *         description: Customer + account created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       409:
 *         description: Email or KYC identity already registered
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in as an existing customer
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: 'test@vivaldigital.com' }
 *               password: { type: string, example: 'SecurePass123' }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get the authenticated customer's profile + account
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile + account
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/me', requireAuth, authController.me);

export default router;