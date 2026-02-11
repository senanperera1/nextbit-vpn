import express from 'express';
import { protect, adminOnly } from '../middleware/authmiddleware.js';
import {
    createPremade,
    listPremadeAdmin,
    updatePremade,
    deletePremade,
    listPremadeUser,
    activatePremade,
} from '../controller/premadecontroller.js';

const router = express.Router();

// User routes (auth required)
router.get('/list', protect, listPremadeUser);
router.post('/:id/activate', protect, activatePremade);

// Admin routes
router.get('/admin/list', protect, adminOnly, listPremadeAdmin);
router.post('/admin/create', protect, adminOnly, createPremade);
router.put('/admin/:id', protect, adminOnly, updatePremade);
router.delete('/admin/:id', protect, adminOnly, deletePremade);

export default router;
