import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authmiddleware.js';
import {
    getActiveNotices,
    listNotices,
    createNotice,
    updateNotice,
    deleteNotice,
} from '../controller/noticecontroller.js';

const router = Router();

// Public
router.get('/active', getActiveNotices);

// Admin
router.get('/', protect, adminOnly, listNotices);
router.post('/', protect, adminOnly, createNotice);
router.put('/:id', protect, adminOnly, updateNotice);
router.delete('/:id', protect, adminOnly, deleteNotice);

export default router;

