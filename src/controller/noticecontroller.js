import { prisma } from '../config/db.js';

// Public: get all enabled notices
export const getActiveNotices = async (req, res) => {
    try {
        const notices = await prisma.notice.findMany({
            where: { enabled: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ notices });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Admin: list all notices
export const listNotices = async (req, res) => {
    try {
        const notices = await prisma.notice.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ notices });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Admin: create notice
export const createNotice = async (req, res) => {
    try {
        const { title, message, type } = req.body;
        if (!title || !message) return res.status(400).json({ error: 'Title and message required' });
        const notice = await prisma.notice.create({
            data: { title, message, type: type || 'info' },
        });
        res.status(201).json({ notice });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Admin: update notice
export const updateNotice = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, message, type, enabled } = req.body;
        const notice = await prisma.notice.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(message !== undefined && { message }),
                ...(type !== undefined && { type }),
                ...(enabled !== undefined && { enabled }),
            },
        });
        res.json({ notice });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Admin: delete notice
export const deleteNotice = async (req, res) => {
    try {
        await prisma.notice.delete({ where: { id: req.params.id } });
        res.json({ message: 'Notice deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
