import { prisma } from '../config/prisma';
import { nibssService, NibssError } from './nibss.service';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface TransferInput {
  senderAccountId: string;
  senderAccountNumber: string;
  recipientAccountNumber: string;
  amount: number;
  narration?: string;
}

export const transferService = {
  /**
   * Look up account holder name for a given account number.
   * Pass-through to NIBSS, no DB writes.
   */
  async nameEnquiry(accountNumber: string) {
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new AppError('Account number must be 10 digits', 400);
    }
    const result = await nibssService.nameEnquiry(accountNumber);
    return result;
  },

  /**
   * Get balance for a specific account. We do NOT read balance from our DB —
   * NIBSS is the source of truth for the ledger.
   */
  async getBalance(accountNumber: string) {
    const result = await nibssService.getBalance(accountNumber);
    return result;
  },

  /**
   * Execute a transfer. Steps:
   *  1. Name-enquiry to get recipient details (also validates account exists)
   *  2. Verify sender's balance is sufficient (from NIBSS)
   *  3. Call NIBSS /api/transfer
   *  4. Log DEBIT for sender + (if intra-bank) CREDIT for recipient
   *  5. Return TSQ + status
   */
  async transfer(input: TransferInput) {
    const {
      senderAccountId,
      senderAccountNumber,
      recipientAccountNumber,
      amount,
      narration,
    } = input;

    if (senderAccountNumber === recipientAccountNumber) {
      throw new AppError('Cannot transfer to your own account', 400);
    }

    // 1. Name enquiry on recipient
    const recipient = await nibssService.nameEnquiry(recipientAccountNumber);

    // 2. Pre-check sender balance
    const senderBalance = await nibssService.getBalance(senderAccountNumber);
    if (senderBalance.balance < amount) {
      throw new AppError(
        `Insufficient funds. Available: ₦${senderBalance.balance.toLocaleString()}`,
        400,
      );
    }

    // 3. Execute transfer on NIBSS
    const result = await nibssService.transfer({
      from: senderAccountNumber,
      to: recipientAccountNumber,
      amount: String(amount),
    });

    // 4. Determine scope (intra-bank if recipient bank matches ours)
    const isIntraBank =
      recipient.bankCode === env.NIBSS_BANK_CODE ||
      recipient.bankName === env.NIBSS_BANK_NAME ||
      (recipient.bankName?.toLowerCase().includes('viv') ?? false);

    // Find recipient account in our DB — only exists if intra-bank AND
    // the recipient is a customer of ours
    const recipientAccount = isIntraBank
      ? await prisma.account.findUnique({
          where: { accountNumber: recipientAccountNumber },
        })
      : null;

    // 5. Log transactions atomically
    await prisma.$transaction([
      // DEBIT on sender
      prisma.transaction.create({
        data: {
          accountId: senderAccountId,
          direction: 'DEBIT',
          nibssTransactionId: result.transactionId,
          nibssStatus: result.status,
          amount: amount,
          counterpartyAccount: recipientAccountNumber,
          counterpartyName: recipient.accountName,
          counterpartyBankName: recipient.bankName ?? null,
          narration: narration ?? null,
          scope: isIntraBank ? 'INTRA_BANK' : 'INTER_BANK',
        },
      }),
      // CREDIT on recipient — only if they're also our customer
      ...(recipientAccount
        ? [
            prisma.transaction.create({
              data: {
                accountId: recipientAccount.id,
                direction: 'CREDIT',
                nibssTransactionId: result.transactionId,
                nibssStatus: result.status,
                amount: amount,
                counterpartyAccount: senderAccountNumber,
                counterpartyName: null,
                counterpartyBankName: env.NIBSS_BANK_NAME,
                narration: narration ?? null,
                scope: 'INTRA_BANK',
              },
            }),
          ]
        : []),
    ]);

    logger.info(
      `[Transfer] ${senderAccountNumber} → ${recipientAccountNumber} ₦${amount} (TSQ: ${result.transactionId})`,
    );

    return {
      transactionId: result.transactionId,
      status: result.status,
      amount: result.amount,
      from: result.from,
      to: result.to,
      recipientName: recipient.accountName,
      recipientBank: recipient.bankName,
    };
  },

  /**
   * Query transaction status.
   *
   * Returns the transaction from the REQUESTER's perspective:
   *   - Only if they are a party to the transaction (sender OR recipient)
   *   - With counterparty details scoped to their side
   *   - Blended with the live NIBSS status (when available)
   *
   * This enforces strict data isolation: a third party cannot see
   * another customer's transaction, and a party sees only their own
   * side of the ledger.
   */
  async transactionStatus(transactionId: string, requesterAccountId: string) {
    // Find the requester's OWN Transaction row for this TSQ.
    const txn = await prisma.transaction.findFirst({
      where: {
        nibssTransactionId: transactionId,
        accountId: requesterAccountId,
      },
    });

    if (!txn) {
      throw new AppError('Transaction not found', 404);
    }

    // Attempt to fetch live status from NIBSS; fall back to stored status.
    let liveStatus: string | undefined;
    try {
      const status = await nibssService.transactionStatus(transactionId);
      liveStatus = status.status;
    } catch (err) {
      logger.warn(
        `[Transfer] Could not fetch live status for ${transactionId}, using stored`,
        err,
      );
    }

    return {
      transactionId,
      direction: txn.direction,
      status: liveStatus ?? txn.nibssStatus,
      amount: Number(txn.amount),
      counterpartyAccount: txn.counterpartyAccount,
      counterpartyName: txn.counterpartyName,
      counterpartyBankName: txn.counterpartyBankName,
      scope: txn.scope,
      narration: txn.narration,
      createdAt: txn.createdAt,
    };
  },

  /**
   * Transaction history for the authenticated customer.
   * Strictly filtered by their accountId — cannot see others' transactions.
   */
  async history(accountId: string, limit: number = 50) {
    return prisma.transaction.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};