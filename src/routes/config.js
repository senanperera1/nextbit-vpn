import express from 'express';
import { protect } from '../middleware/authmiddleware.js';
import {

    createConfig,
    getUserConfigs,
    getConfigDetail,
    getUserRestrictions,
    deleteConfig,
    updateConfig,
} from '../controller/configcontroller.js';

const router = express.Router();

router.use(protect);

router.post('/create', createConfig);
router.get('/list', getUserConfigs);
router.get('/restrictions', getUserRestrictions);
router.delete('/:id', deleteConfig);
router.put('/:id', updateConfig);
router.get('/:id', getConfigDetail);

export default router;
