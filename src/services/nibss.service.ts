import { nibssClient, NibssError } from './nibss.client';
import { env } from '../config/env';

// ─── NIBSS wraps all responses as { success, message, data } ─────────
export interface NibssEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type KycType = 'BVN' | 'NIN';

// ─── Payload types (what lives inside .data) ─────────────────────────

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
  bankName: string;
}

interface BalancePayload {
  accountNumber: string;
  balance: number;
}

interface TransferPayload {
  message: string;
  transactionId: string; // TSQ
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

// ─── Service ─────────────────────────────────────────────────────────

export const nibssService = {
  async insertBvn(input: InsertBvnInput): Promise<InsertBvnPayload> {
    const res = await nibssClient.request<NibssEnvelope<InsertBvnPayload>>({
      method: 'POST',
      url: '/api/insertBvn',
      data: input,
    });
    return res.data;
  },

  async insertNin(input: InsertNinInput): Promise<InsertNinPayload> {
    const res = await nibssClient.request<NibssEnvelope<InsertNinPayload>>({
      method: 'POST',
      url: '/api/insertNin',
      data: input,
    });
    return res.data;
  },

  async validateBvn(bvn: string): Promise<ValidateBvnPayload & { valid: boolean }> {
    const res = await nibssClient.request<NibssEnvelope<ValidateBvnPayload>>({
      method: 'POST',
      url: '/api/validateBvn',
      data: { bvn },
    });
    return { ...res.data, valid: res.success };
  },

  async validateNin(nin: string): Promise<ValidateNinPayload & { valid: boolean }> {
    const res = await nibssClient.request<NibssEnvelope<ValidateNinPayload>>({
      method: 'POST',
      url: '/api/validateNin',
      data: { nin },
    });
    return { ...res.data, valid: res.success };
  },

  async createAccount(input: CreateAccountInput): Promise<CreateAccountPayload> {
    const res = await nibssClient.request<any>({
      method: 'POST',
      url: '/api/account/create',
      data: input,
    });

    // NIBSS has been observed returning two shapes for this endpoint:
    //   1. { message, account: {...} }                       (flat)
    //   2. { success, message, data: { account: {...} } }    (wrapped)
    // Handle both without breaking when NIBSS changes it again.
    const account = res?.account ?? res?.data?.account;
    if (!account) {
      throw new NibssError(
        `Unexpected account/create response shape: ${JSON.stringify(res)}`,
      );
    }
    return account as CreateAccountPayload;
  },

  async nameEnquiry(accountNumber: string): Promise<NameEnquiryPayload> {
    const res = await nibssClient.request<NibssEnvelope<NameEnquiryPayload>>({
      method: 'GET',
      url: `/api/account/name-enquiry/${accountNumber}`,
    });
    return res.data;
  },

  async getBalance(accountNumber: string): Promise<BalancePayload> {
    const res = await nibssClient.request<NibssEnvelope<BalancePayload>>({
      method: 'GET',
      url: `/api/account/balance/${accountNumber}`,
    });
    return res.data;
  },

  async transfer(input: TransferInput): Promise<TransferPayload> {
    const res = await nibssClient.request<NibssEnvelope<TransferPayload>>({
      method: 'POST',
      url: '/api/transfer',
      data: input,
    });
    return res.data;
  },

  async transactionStatus(transactionId: string): Promise<TransactionStatusPayload> {
    const res = await nibssClient.request<NibssEnvelope<TransactionStatusPayload>>({
      method: 'GET',
      url: `/api/transaction/${transactionId}`,
    });
    return res.data;
  },

  ourBank: {
    code: env.NIBSS_BANK_CODE,
    name: env.NIBSS_BANK_NAME,
  },
};

export { NibssError };