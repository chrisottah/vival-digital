export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string; // YYYY-MM-DD
  kycType: 'BVN' | 'NIN';
  kycId: string; // 11-digit BVN or NIN
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface JwtPayload {
  customerId: string;
  accountId: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    kycType: 'BVN' | 'NIN';
    verified: boolean;
  };
  account: {
    id: string;
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
  };
}