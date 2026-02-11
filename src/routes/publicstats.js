import express from 'express';
import { prisma } from '../config/db.js';
import xuiService from '../services/xui.js';

const router = express.Router();

// Public stats — no auth, toggleable from admin
router.get('/', async (req, res) => {
    try {
        let settings;
        try {
            settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
        } catch (e) { }

        if (settings && !settings.showLiveUsers) {
            return res.json({ totalUsers: 0, onlineUsers: 0, hidden: true });
        }

        const totalUsers = await prisma.user.count();

        let onlineUsers = 0;
        try {
            const onlineResult = await xuiService.getOnlineClients();
            if (onlineResult.success && Array.isArray(onlineResult.obj)) {
                onlineUsers = onlineResult.obj.length;
            }
        } catch (e) { }

        res.json({ totalUsers, onlineUsers, hidden: false });
    } catch (err) {
        res.json({ totalUsers: 0, onlineUsers: 0, hidden: false });
    }
});

export default router;
