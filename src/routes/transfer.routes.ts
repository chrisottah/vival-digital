import { Router } from 'express';
import { transferController } from '../controllers/transfer.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/name-enquiry/:accountNumber', transferController.nameEnquiry);
router.get('/balance', transferController.balance);
router.post('/', transferController.transfer);
router.get('/status/:transactionId', transferController.status);
router.get('/history', transferController.history);

export default router;