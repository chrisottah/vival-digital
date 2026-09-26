import { prisma } from '../config/prisma';
import { nibssService, NibssError } from './nibss.service';
import { hashPassword, verifyPassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { RegisterInput, LoginInput, AuthResponse } from '../types/auth.types';

export const authService = {
  /**
   * Full onboarding:
   *  1. Check for existing email/kycId in our DB
   *  2. Register KYC identity in NIBSS (idempotent — ignore "already exists")
   *  3. Validate the identity (confirm it exists)
   *  4. Create a NIBSS account (returns NUBAN + ₦15,000 pre-fund)
   *  5. Persist Customer + Account in our DB
   *  6. Sign and return a JWT for the customer
   */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const { email, password, firstName, lastName, phone, dob, kycType, kycId } = input;

    // 1. Duplicate checks
    const existingByEmail = await prisma.customer.findUnique({ where: { email } });
    if (existingByEmail) {
      throw new AppError('Email already registered', 409);
    }
    const existingByKyc = await prisma.customer.findUnique({ where: { kycId } });
    if (existingByKyc) {
      throw new AppError(`${kycType} already linked to an account`, 409);
    }

    // 2. Register the identity in NIBSS
    //    If it already exists there (409), that's fine — proceed to validate
    try {
      if (kycType === 'BVN') {
        await nibssService.insertBvn({
          bvn: kycId,
          firstName,
          lastName,
          dob,
          phone,
        });
      } else {
        await nibssService.insertNin({
          nin: kycId,
          firstName,
          lastName,
          dob,
        });
      }
      logger.info(`[Auth] ${kycType} ${kycId} registered on NIBSS`);
    } catch (err) {
      if (err instanceof NibssError && err.statusCode === 409) {
        logger.info(`[Auth] ${kycType} ${kycId} already exists on NIBSS, continuing`);
      } else {
        throw err;
      }
    }

    // 3. Validate the identity
    const validation =
      kycType === 'BVN'
        ? await nibssService.validateBvn(kycId)
        : await nibssService.validateNin(kycId);

    if (!validation.valid) {
      throw new AppError(`${kycType} validation failed`, 400);
    }

    logger.info(`[Auth] ${kycType} ${kycId} validated as ${validation.firstName} ${validation.lastName}`);

    // 4. Create the account on NIBSS
    let accountResult;
    try {
      accountResult = await nibssService.createAccount({
        kycType: kycType.toLowerCase() as 'bvn' | 'nin',
        kycID: kycId,
        dob,
      });
    } catch (err) {
      if (err instanceof NibssError && err.statusCode === 400) {
        const msg = (err.responseBody as { message?: string })?.message ?? '';
        if (msg.toLowerCase().includes('already linked')) {
          throw new AppError(
            'This KYC identity is already linked to a NIBSS account. Please use a different BVN/NIN.',
            409,
          );
        }
      }
      throw err;
    }

    if (!accountResult) {
      throw new AppError('NIBSS account creation returned no response body', 502);
    }
    if (!accountResult.accountNumber) {
      throw new AppError(
        `NIBSS did not return an account number. Response: ${JSON.stringify(accountResult)}`,
        502,
      );
    }

    // 5. Persist in our DB
    const passwordHash = await hashPassword(password);

    const customer = await prisma.customer.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        dob: new Date(dob),
        kycType,
        kycId,
        verified: true,
        account: {
          create: {
            accountNumber: accountResult.accountNumber,
            bankCode: accountResult.bankCode,
            bankName: env.NIBSS_BANK_NAME,
            accountName: accountResult.accountName,
          },
        },
      },
      include: { account: true },
    });

    if (!customer.account) {
      throw new AppError('Account was not created', 500);
    }

    logger.info(`[Auth] Customer ${customer.id} onboarded with account ${customer.account.accountNumber}`);

    // 6. Sign JWT
    const token = signToken({
      customerId: customer.id,
      accountId: customer.account.id,
      email: customer.email,
    });

    return {
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        kycType: customer.kycType,
        verified: customer.verified,
      },
      account: {
        id: customer.account.id,
        accountNumber: customer.account.accountNumber,
        accountName: customer.account.accountName,
        bankCode: customer.account.bankCode,
        bankName: customer.account.bankName,
      },
    };
  },

  /**
   * Standard login: email + password → JWT.
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const { email, password } = input;

    const customer = await prisma.customer.findUnique({
      where: { email },
      include: { account: true },
    });

    if (!customer || !customer.account) {
      throw new AppError('Invalid credentials', 401);
    }

    const passwordOk = await verifyPassword(password, customer.passwordHash);
    if (!passwordOk) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = signToken({
      customerId: customer.id,
      accountId: customer.account.id,
      email: customer.email,
    });

    return {
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        kycType: customer.kycType,
        verified: customer.verified,
      },
      account: {
        id: customer.account.id,
        accountNumber: customer.account.accountNumber,
        accountName: customer.account.accountName,
        bankCode: customer.account.bankCode,
        bankName: customer.account.bankName,
      },
    };
  },

  /**
   * Fetch current customer profile (from JWT).
   */
  async me(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { account: true },
    });

    if (!customer || !customer.account) {
      throw new AppError('Customer not found', 404);
    }

    return {
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        dob: customer.dob,
        kycType: customer.kycType,
        verified: customer.verified,
      },
      account: {
        id: customer.account.id,
        accountNumber: customer.account.accountNumber,
        accountName: customer.account.accountName,
        bankCode: customer.account.bankCode,
        bankName: customer.account.bankName,
      },
    };
  },
};