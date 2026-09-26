import { Router } from 'express';
import { transferController } from '../controllers/transfer.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /api/transfer/name-enquiry/{accountNumber}:
 *   get:
 *     summary: Resolve an account number to its holder's name
 *     description: Pre-transfer verification step. Always call this before initiating a transfer.
 *     tags: [Banking]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: accountNumber
 *         required: true
 *         schema: { type: string, pattern: '^\\d{10}$' }
 *         example: '6491729596'
 *     responses:
 *       200:
 *         description: Recipient details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accountNumber: { type: string, example: '6491729596' }
 *                 accountName: { type: string, example: 'Ade Recipient' }
 *                 bankCode: { type: string, example: '649' }
 *                 bankName: { type: string, example: 'VIV Bank' }
 *       404:
 *         description: Account not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/name-enquiry/:accountNumber', transferController.nameEnquiry);

/**
 * @swagger
 * /api/transfer/balance:
 *   get:
 *     summary: Get the authenticated customer's account balance
 *     description: Balance is sourced live from NIBSS — not cached.
 *     tags: [Banking]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Account balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accountNumber: { type: string, example: '6492793338' }
 *                 balance: { type: number, example: 15000 }
 *                 bankName: { type: string, example: 'VIV Bank' }
 */
router.get('/balance', transferController.balance);

/**
 * @swagger
 * /api/transfer:
 *   post:
 *     summary: Initiate a fund transfer
 *     description: |
 *       Executes an intra-bank or inter-bank transfer via NIBSS. The sender
 *       account is resolved from the JWT — it cannot be spoofed via the body.
 *       Logs a DEBIT for the sender and, if the recipient is also our customer,
 *       a matching CREDIT.
 *     tags: [Banking]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientAccountNumber, amount]
 *             properties:
 *               recipientAccountNumber: { type: string, pattern: '^\\d{10}$', example: '6491729596' }
 *               amount: { type: number, minimum: 1, maximum: 1000000, example: 2000 }
 *               narration: { type: string, maxLength: 140, example: 'Rent payment' }
 *     responses:
 *       201:
 *         description: Transfer executed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactionId: { type: string, example: 'TX1790388266455' }
 *                 status: { type: string, example: 'SUCCESS' }
 *                 amount: { type: number, example: 2000 }
 *                 from: { type: string, example: '6492793338' }
 *                 to: { type: string, example: '6491729596' }
 *                 recipientName: { type: string, example: 'Ade Recipient' }
 *                 recipientBank: { type: string, example: 'VIV Bank' }
 *       400:
 *         description: Insufficient funds or invalid recipient
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', transferController.transfer);

/**
 * @swagger
 * /api/transfer/status/{transactionId}:
 *   get:
 *     summary: Query transaction status by TSQ
 *     description: |
 *       Returns the transaction from the requester's perspective. Sender sees
 *       DEBIT with recipient info; recipient sees CREDIT with sender account.
 *       Third parties receive 404 — strict data isolation.
 *     tags: [Banking]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema: { type: string }
 *         example: 'TX1790388266455'
 *     responses:
 *       200:
 *         description: Transaction status
 *       404:
 *         description: Not found or requester is not a party
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/status/:transactionId', transferController.status);

/**
 * @swagger
 * /api/transfer/history:
 *   get:
 *     summary: Get the authenticated customer's transaction history
 *     description: Strictly filtered by the JWT's accountId — no cross-customer leakage.
 *     tags: [Banking]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Transaction list, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Transaction' }
 */
router.get('/history', transferController.history);

export default router;