import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Vival Digital — Banking API',
      version: '1.0.0',
      description:
        'Backend for Vival Digital bank. Integrates with Nibss by Phoenix for onboarding, transfers, and account operations.',
      contact: {
        name: 'TS Academy Phoenix Cohort',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Our own JWT, returned from /api/auth/register or /api/auth/login',
        },
      },
      schemas: {
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            kycType: { type: 'string', enum: ['BVN', 'NIN'] },
            verified: { type: 'boolean' },
          },
        },
        Account: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            accountNumber: { type: 'string', example: '6492793338' },
            accountName: { type: 'string' },
            bankCode: { type: 'string', example: '649' },
            bankName: { type: 'string', example: 'VIV Bank' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            customer: { $ref: '#/components/schemas/Customer' },
            account: { $ref: '#/components/schemas/Account' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            direction: { type: 'string', enum: ['DEBIT', 'CREDIT'] },
            nibssTransactionId: { type: 'string', example: 'TX1790388266455' },
            nibssStatus: { type: 'string', example: 'SUCCESS' },
            amount: { type: 'string', example: '100' },
            currency: { type: 'string', example: 'NGN' },
            counterpartyAccount: { type: 'string' },
            counterpartyName: { type: 'string', nullable: true },
            counterpartyBankName: { type: 'string', nullable: true },
            narration: { type: 'string', nullable: true },
            scope: { type: 'string', enum: ['INTRA_BANK', 'INTER_BANK'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object', nullable: true },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Liveness checks' },
      { name: 'Auth', description: 'Customer onboarding and authentication' },
      { name: 'Banking', description: 'Balance, name enquiry, transfers, history' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);