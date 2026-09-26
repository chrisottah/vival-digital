import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { transferService } from '../services/transfer.service';
import { AppError } from '../middlewares/errorHandler';

const transferSchema = z.object({
  recipientAccountNumber: z.string().regex(/^\d{10}$/, 'Must be 10 digits'),
  amount: z.number().positive().max(1_000_000, 'Max ₦1,000,000 per transfer'),
  narration: z.string().max(140).optional(),
});

export const transferController = {
  async nameEnquiry(req: Request, res: Response, next: NextFunction) {
    try {
      const { accountNumber } = req.params;
      const result = await transferService.nameEnquiry(accountNumber);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

    async balance(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Not authenticated', 401);

      const { prisma } = await import('../config/prisma');
      const account = await prisma.account.findUnique({
        where: { id: req.user.accountId },
      });
      if (!account) throw new AppError('Account not found', 404);

      const result = await transferService.getBalance(account.accountNumber);

      if (!result) {
        throw new AppError('NIBSS returned no balance payload', 502);
      }

      res.json({
        accountNumber: result.accountNumber ?? account.accountNumber,
        balance: result.balance,
        bankName: account.bankName,
      });
    } catch (err) {
      next(err);
    }
  },

  async transfer(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Not authenticated', 401);

      const input = transferSchema.parse(req.body);

      // Resolve sender account from JWT (never trust client-supplied sender)
      const { prisma } = await import('../config/prisma');
      const senderAccount = await prisma.account.findUnique({
        where: { id: req.user.accountId },
      });
      if (!senderAccount) throw new AppError('Sender account not found', 404);

      const result = await transferService.transfer({
        senderAccountId: senderAccount.id,
        senderAccountNumber: senderAccount.accountNumber,
        recipientAccountNumber: input.recipientAccountNumber,
        amount: input.amount,
        narration: input.narration,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Not authenticated', 401);
      const { transactionId } = req.params;
      const result = await transferService.transactionStatus(
        transactionId,
        req.user.accountId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async history(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Not authenticated', 401);
      const result = await transferService.history(req.user.accountId);
      res.json({ transactions: result });
    } catch (err) {
      next(err);
    }
  },
};