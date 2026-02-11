
import express from 'express';
import { signup, signin, logout, verifyEmail, resendVerification } from '../controller/vpnauthcontroller.js';
const router = express.Router();

router.post('/signup', signup);
router.post('/signin', signin);
router.post('/logout', logout);
router.get('/verify', verifyEmail);
router.post('/resend-verification', resendVerification);

export default router;