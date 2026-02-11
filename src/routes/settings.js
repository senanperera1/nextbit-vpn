import express from 'express';
import { protect, adminOnly } from '../middleware/authmiddleware.js';
import {
    getSettings,
    updateSettings,
    updateBackupPanel,
    panelHealth,
    serverStats,
    updateUserRestrictions,
    updateUserSpeedLimit,
    updateUserPlan,
    getRealityKeys,
    updateDisabledPlans,
    getDisabledPlans,
    migrateServer,
    getExchangeRate,
    getPlans,
    updatePlans,
    getLandingPlans,
    updateLandingPlans,
} from '../controller/settingscontroller.js';

const router = express.Router();

// Public routes (no auth)
router.get('/disabled-plans', getDisabledPlans);
router.get('/exchange-rate', getExchangeRate);
router.get('/landing-plans', getLandingPlans);

// All remaining routes require admin
router.use(protect, adminOnly);

router.get('/', getSettings);
router.put('/', updateSettings);
router.put('/backup', updateBackupPanel);
router.get('/health', panelHealth);
router.get('/server-stats', serverStats);
router.put('/user/:id/restrictions', updateUserRestrictions);
router.put('/user/:id/speed', updateUserSpeedLimit);
router.put('/user/:id/plan', updateUserPlan);
router.get('/reality-keys', getRealityKeys);
router.put('/disabled-plans', updateDisabledPlans);
router.get('/plans', getPlans);
router.put('/plans', updatePlans);
router.post('/migrate', migrateServer);
router.put('/landing-plans', updateLandingPlans);

export default router;
