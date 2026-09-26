import { nibssClient, NibssError } from './nibss.client';
import { env } from '../config/env';

// ─── NIBSS wraps some responses and not others — handle both ─────────
export interface NibssEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type KycType = 'BVN' | 'NIN';

// ─── Payload types ───────────────────────────────────────────────────

interface InsertBvnPayload {
  message: string;
  bvn: string;
}
interface InsertNinPayload {
  message: string;
  nin: string;
}

interface ValidateBvnPayload {
  bvn: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone?: string;
}
interface ValidateNinPayload {
  nin: string;
  firstName: string;
  lastName: string;
  dob: string;
}

interface CreateAccountPayload {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  balance: number;
}

interface NameEnquiryPayload {
  accountNumber: string;
  accountName: string;
  bankCode?: string;
  bankName?: string;   // NIBSS sometimes returns bankName, sometimes bankCode
}

interface BalancePayload {
  accountNumber: string;
  balance: number;
}

interface TransferPayload {
  message: string;
  transactionId: string;
  amount: number;
  from: string;
  to: string;
  status: string;
}

interface TransactionStatusPayload {
  transactionId: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  amount: number;
  from: string;
  to: string;
  timestamp: string;
}

// ─── Input types ─────────────────────────────────────────────────────

interface InsertBvnInput {
  bvn: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
}
interface InsertNinInput {
  nin: string;
  firstName: string;
  lastName: string;
  dob: string;
}
interface CreateAccountInput {
  kycType: 'bvn' | 'nin';
  kycID: string;
  dob: string;
}
interface TransferInput {
  from: string;
  to: string;
  amount: string;
}

// ─── Helper: unwrap NIBSS response whether it's wrapped or flat ──────
function unwrap<T>(res: any): T {
  // NIBSS uses two shapes:
  //   1. { success, message, data: {...} }   (wrapped — used by validate, insert)
  //   2. { accountNumber, balance, ... }     (flat — used by some GETs)
  //   3. { message, account: {...} }         (semi-flat — used by account/create)
  // Try data first, then fall back to the response itself.
  if (res && typeof res === 'object' && 'data' in res && res.data) {
    return res.data as T;
  }
  return res as T;
}

// ─── Service ─────────────────────────────────────────────────────────

export const nibssService = {
  async insertBvn(input: InsertBvnInput): Promise<InsertBvnPayload> {
    const res = await nibssClient.request<NibssEnvelope<InsertBvnPayload>>({
      method: 'POST',
      url: '/api/insertBvn',
      data: input,
    });
    return unwrap<InsertBvnPayload>(res);
  },

  async insertNin(input: InsertNinInput): Promise<InsertNinPayload> {
    const res = await nibssClient.request<NibssEnvelope<InsertNinPayload>>({
      method: 'POST',
      url: '/api/insertNin',
      data: input,
    });
    return unwrap<InsertNinPayload>(res);
  },

  async validateBvn(bvn: string): Promise<ValidateBvnPayload & { valid: boolean }> {
    const res = await nibssClient.request<any>({
      method: 'POST',
      url: '/api/validateBvn',
      data: { bvn },
    });
    const payload = unwrap<ValidateBvnPayload>(res);
    return { ...payload, valid: res?.success === true || !!payload?.bvn };
  },

  async validateNin(nin: string): Promise<ValidateNinPayload & { valid: boolean }> {
    const res = await nibssClient.request<any>({
      method: 'POST',
      url: '/api/validateNin',
      data: { nin },
    });
    const payload = unwrap<ValidateNinPayload>(res);
    return { ...payload, valid: res?.success === true || !!payload?.nin };
  },

  async createAccount(input: CreateAccountInput): Promise<CreateAccountPayload> {
    const res = await nibssClient.request<any>({
      method: 'POST',
      url: '/api/account/create',
      data: input,
    });

    // account/create is semi-flat: { message, account: {...} }
    const account = res?.account ?? res?.data?.account ?? res?.data;
    if (!account?.accountNumber) {
      throw new NibssError(
        `Unexpected account/create response shape: ${JSON.stringify(res)}`,
      );
    }
    return account as CreateAccountPayload;
  },

    async nameEnquiry(accountNumber: string): Promise<NameEnquiryPayload> {
    const res = await nibssClient.request<any>({
      method: 'GET',
      url: `/api/account/name-enquiry/${accountNumber}`,
    });

    const payload = unwrap<NameEnquiryPayload>(res);
    if (!payload?.accountNumber) {
      throw new NibssError(
        `Unexpected name-enquiry response shape: ${JSON.stringify(res)}`,
      );
    }

    // Normalize: if NIBSS only returned bankCode, infer bankName from ours
    return {
      accountNumber: payload.accountNumber,
      accountName: payload.accountName,
      bankCode: payload.bankCode ?? env.NIBSS_BANK_CODE,
      bankName: payload.bankName ?? (
        payload.bankCode === env.NIBSS_BANK_CODE ? env.NIBSS_BANK_NAME : undefined
      ),
    };
  },

  async getBalance(accountNumber: string): Promise<BalancePayload> {
    const res = await nibssClient.request<any>({
      method: 'GET',
      url: `/api/account/balance/${accountNumber}`,
    });

    const payload = unwrap<BalancePayload>(res);
    if (typeof payload?.balance !== 'number') {
      throw new NibssError(
        `Unexpected balance response shape: ${JSON.stringify(res)}`,
      );
    }
    return payload;
  },

  async transfer(input: TransferInput): Promise<TransferPayload> {
    const res = await nibssClient.request<any>({
      method: 'POST',
      url: '/api/transfer',
      data: input,
    });

    // NIBSS transfer response shape (observed):
    //   { reference, senderAccount, receiverAccount, amount, status, _id, ... }
    const payload = unwrap<any>(res);
    if (!payload?.reference) {
      throw new NibssError(
        `Unexpected transfer response shape: ${JSON.stringify(res)}`,
      );
    }

    // Normalize to our internal TransferPayload shape
    return {
      message: payload.message ?? 'Transfer successful',
      transactionId: payload.reference,
      amount: payload.amount,
      from: payload.senderAccount ?? input.from,
      to: payload.receiverAccount ?? input.to,
      status: payload.status,
    };
  },

  async transactionStatus(transactionId: string): Promise<TransactionStatusPayload> {
    const res = await nibssClient.request<any>({
      method: 'GET',
      url: `/api/transaction/${transactionId}`,
    });

    const payload = unwrap<any>(res);
    const ref = payload?.transactionId ?? payload?.reference;

    if (!ref) {
      throw new NibssError(
        `Unexpected transaction status response shape: ${JSON.stringify(res)}`,
      );
    }

    return {
      transactionId: ref,
      status: payload.status,
      amount: payload.amount,
      from: payload.from ?? payload.senderAccount,
      to: payload.to ?? payload.receiverAccount,
      timestamp: payload.timestamp ?? payload.createdAt ?? new Date().toISOString(),
    };
  },

  ourBank: {
    code: env.NIBSS_BANK_CODE,
    name: env.NIBSS_BANK_NAME,
  },
};

export { NibssError };