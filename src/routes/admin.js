import express from 'express';
import {
    getAllUsers,
    getUserDetail,
    toggleConfig,
    deleteConfig,
    addConfigToUser,
    updateUserLimits,
} from '../controller/admincontroller.js';
import { protect, adminOnly } from '../middleware/authmiddleware.js';

const router = express.Router();

// All admin routes require auth + admin role
router.use(protect, adminOnly);

router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetail);
router.post('/config/add', addConfigToUser);
router.post('/config/:id/toggle', toggleConfig);
router.delete('/config/:id', deleteConfig);
router.put('/users/:id/limits', updateUserLimits);

export default router;
