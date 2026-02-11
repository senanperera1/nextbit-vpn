import { prisma } from '../config/db.js';
import xuiService from '../services/xui.js';

// Get all users with config counts
export const getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                plan: true,
                planExpiry: true,
                speedLimit: true,
                emailVerified: true,
                createdAt: true,
                maxConfigs: true,
                currentConfigs: true,
                allowedmaxgb: true,
                currentgb: true,
                restrictions: true,
                _count: { select: { configs: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ users });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get a specific user's details with all their configs and live stats
export const getUserDetail = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            include: { configs: { orderBy: { createdAt: 'desc' } } },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get online clients from XUI
        const onlineResult = await xuiService.getOnlineClients().catch(() => ({ success: false }));
        const onlineEmails = onlineResult.success ? (onlineResult.obj || []) : [];

        // Get all inbounds to extract connected IPs
        let allInbounds = [];
        try {
            const ibResult = await xuiService.listInbounds();
            allInbounds = ibResult.obj || [];
        } catch (e) { }

        // Build a map of clientEmail -> connected IPs from clientStats
        const ipMap = {};
        for (const ib of allInbounds) {
            try {
                const stats = JSON.parse(ib.clientStats || '[]');
                // clientStats doesn't have IPs directly, but we can check online status
            } catch (e) { }
        }

        const enrichedConfigs = await Promise.all(
            user.configs.map(async (cfg) => {
                // Use the stored clientEmail from DB instead of constructing
                const clientEmail = cfg.clientEmail || `${cfg.userId}-${cfg.name}`.replace(/\s+/g, '-').toLowerCase();
                let traffic = { up: 0, down: 0 };
                let connectedIps = [];

                try {
                    const trafficResult = await xuiService.getClientTraffic(clientEmail);
                    if (trafficResult.success && trafficResult.obj) {
                        traffic = { up: trafficResult.obj.up || 0, down: trafficResult.obj.down || 0 };
                    }
                } catch (e) { }

                // Get connected IPs for this config from the inbound
                try {
                    const inbound = allInbounds.find(ib => ib.id === cfg.inboundId);
                    if (inbound) {
                        const stats = JSON.parse(inbound.clientStats || '[]');
                        const clientStat = stats.find(s => s.email === clientEmail);
                        if (clientStat && clientStat.inboundId) {
                            // IPs are in the online data
                        }
                    }
                } catch (e) { }

                const isOnline = onlineEmails.includes(clientEmail);

                return {
                    ...cfg,
                    traffic,
                    totalUsageGB: ((traffic.up + traffic.down) / 1073741824).toFixed(2),
                    isOnline,
                    connectedIps,
                    v2rayUrl: cfg.v2rayUrl,
                    onlineStatus: isOnline ? 'Online' : (cfg.enabled ? 'Offline' : 'Disabled')
                };
            })
        );

        const { password, verificationToken, ...safeUser } = user;
        res.json({
            ...safeUser,
            configs: enrichedConfigs,
        });
    } catch (error) {
        console.error('Get user detail error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Toggle config enable/disable
export const toggleConfig = async (req, res) => {
    try {
        const config = await prisma.config.findUnique({
            where: { id: req.params.id },
        });

        if (!config) {
            return res.status(404).json({ error: 'Config not found' });
        }

        const newEnabled = !config.enabled;
        // Use stored clientEmail from DB
        const clientEmail = config.clientEmail || `${config.userId}-${config.name}`.replace(/\s+/g, '-').toLowerCase();

        // Update in 3X-UI
        const clientUpdate = {
            id: config.inboundId,
            settings: JSON.stringify({
                clients: [{
                    id: config.protocol === 'trojan' ? undefined : config.xrayClientId,
                    password: config.protocol === 'trojan' ? config.xrayClientId : undefined,
                    email: clientEmail,
                    enable: newEnabled,
                }],
            }),
        };

        await xuiService.updateClient(config.xrayClientId, clientUpdate);

        // Update in our database
        const updated = await prisma.config.update({
            where: { id: config.id },
            data: { enabled: newEnabled },
        });

        res.json({ message: `Config ${newEnabled ? 'enabled' : 'disabled'}`, config: updated });
    } catch (error) {
        console.error('Toggle config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Delete a config
export const deleteConfig = async (req, res) => {
    try {
        const config = await prisma.config.findUnique({
            where: { id: req.params.id },
        });

        if (!config) {
            return res.status(404).json({ error: 'Config not found' });
        }

        // Remove from 3X-UI
        try {
            await xuiService.deleteClient(config.inboundId, config.xrayClientId);
        } catch (xuiErr) {
            console.error('Failed to delete from XUI panel:', xuiErr.message);
            // Continue with DB deletion even if XUI fails
        }

        // Remove from database
        await prisma.config.delete({ where: { id: config.id } });

        // Update user config count
        await prisma.user.update({
            where: { id: config.userId },
            data: { currentConfigs: { decrement: 1 } },
        });

        res.json({ message: 'Config deleted successfully' });
    } catch (error) {
        console.error('Delete config error:', error);
        res.status(500).json({ error: 'Failed to delete config: ' + (error.message || 'Unknown error') });
    }
};

// Add a config to any user (admin)
export const addConfigToUser = async (req, res) => {
    try {
        const { userId, name, protocol = 'vless', security, network, port, sni, fingerprint } = req.body;

        if (!userId || !name) {
            return res.status(400).json({ error: 'userId and name are required' });
        }

        // Temporarily set req.user.id to the target user for createConfig reuse
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Store original user and temporarily override
        const originalUser = req.user;
        req.user = { ...originalUser, id: userId, maxConfigs: user.maxConfigs, allowedmaxgb: user.allowedmaxgb, currentgb: user.currentgb };
        req.body = { name, protocol, security, network, port, sni, fingerprint };

        // Import and call createConfig
        const { createConfig } = await import('./configcontroller.js');
        await createConfig(req, res);

        // Restore original user
        req.user = originalUser;
    } catch (error) {
        console.error('Add config to user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update user limits
export const updateUserLimits = async (req, res) => {
    try {
        const { maxConfigs, allowedmaxgb } = req.body;

        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updated = await prisma.user.update({
            where: { id: req.params.id },
            data: {
                ...(maxConfigs !== undefined && { maxConfigs }),
                ...(allowedmaxgb !== undefined && { allowedmaxgb }),
            },
        });

        const { password, ...safeUser } = updated;
        res.json({ message: 'User limits updated', user: safeUser });
    } catch (error) {
        console.error('Update user limits error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
