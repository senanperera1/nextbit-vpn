import { prisma } from '../config/db.js';
import xuiService from '../services/xui.js';

// ─── Get global admin settings ───
export const getSettings = async (req, res) => {
    try {
        let settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
        if (!settings) {
            settings = await prisma.adminSettings.create({ data: { id: 'global' } });
        }
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Update global admin settings ───
export const updateSettings = async (req, res) => {
    try {
        const { defaultMaxConfigs, defaultMaxGB, defaultSpeedLimit, defaultRestrictions, showLiveUsers } = req.body;
        const settings = await prisma.adminSettings.upsert({
            where: { id: 'global' },
            update: {
                ...(defaultMaxConfigs !== undefined && { defaultMaxConfigs }),
                ...(defaultMaxGB !== undefined && { defaultMaxGB }),
                ...(defaultSpeedLimit !== undefined && { defaultSpeedLimit }),
                ...(defaultRestrictions !== undefined && { defaultRestrictions }),
                ...(showLiveUsers !== undefined && { showLiveUsers }),
            },
            create: {
                id: 'global',
                defaultMaxConfigs: defaultMaxConfigs || 2,
                defaultMaxGB: defaultMaxGB || 10,
                defaultSpeedLimit: defaultSpeedLimit || 0,
                defaultRestrictions: defaultRestrictions || null,
                showLiveUsers: showLiveUsers !== undefined ? showLiveUsers : true,
            },
        });
        res.json({ message: 'Settings updated', settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Get/update backup panel config ───
export const updateBackupPanel = async (req, res) => {
    try {
        const { backupPanelUrl, backupPanelUser, backupPanelPass } = req.body;
        const settings = await prisma.adminSettings.upsert({
            where: { id: 'global' },
            update: { backupPanelUrl, backupPanelUser, backupPanelPass },
            create: { id: 'global', backupPanelUrl, backupPanelUser, backupPanelPass },
        });
        await xuiService.loadBackupConfig();
        res.json({ message: 'Backup panel updated', settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Panel health check ───
export const panelHealth = async (req, res) => {
    try {
        const primary = await xuiService.healthCheck(process.env.XUI_PANEL_URL);
        let backup = { online: false, url: null };
        const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
        if (settings?.backupPanelUrl) {
            backup = await xuiService.healthCheck(settings.backupPanelUrl);
        }
        res.json({ primary, backup, activePanel: xuiService.usingBackup ? 'backup' : 'primary' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Server stats from 3X-UI ───
export const serverStats = async (req, res) => {
    try {
        const status = await xuiService.getServerStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Update per-user restrictions ───
export const updateUserRestrictions = async (req, res) => {
    try {
        const { id } = req.params;
        const { restrictions } = req.body;
        const user = await prisma.user.update({
            where: { id },
            data: { restrictions },
        });
        res.json({ message: 'Restrictions updated', user: { id: user.id, restrictions: user.restrictions } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Update per-user speed limit ───
export const updateUserSpeedLimit = async (req, res) => {
    try {
        const { id } = req.params;
        const { speedLimit } = req.body;
        const user = await prisma.user.update({
            where: { id },
            data: { speedLimit: speedLimit || 0 },
        });
        res.json({ message: 'Speed limit updated', user: { id: user.id, speedLimit: user.speedLimit } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Update user plan ───
export const updateUserPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { plan, planExpiry, maxConfigs, allowedmaxgb, speedLimit } = req.body;

        const data = {};
        if (plan) data.plan = plan;
        if (planExpiry) data.planExpiry = new Date(planExpiry);
        if (maxConfigs !== undefined) data.maxConfigs = maxConfigs;
        if (allowedmaxgb !== undefined) data.allowedmaxgb = allowedmaxgb;
        if (speedLimit !== undefined) data.speedLimit = speedLimit;

        const user = await prisma.user.update({ where: { id }, data });
        const { password, verificationToken, ...safeUser } = user;
        res.json({ message: 'User plan updated', user: safeUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Get Reality keys ───
export const getRealityKeys = async (req, res) => {
    try {
        const keys = await xuiService.getNewX25519Cert();
        res.json(keys);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Update disabled plans ───
export const updateDisabledPlans = async (req, res) => {
    try {
        const { disabledPlans } = req.body;
        const settings = await prisma.adminSettings.upsert({
            where: { id: 'global' },
            update: { disabledPlans: disabledPlans || [] },
            create: { id: 'global', disabledPlans: disabledPlans || [] },
        });
        res.json({ message: 'Plan visibility updated', disabledPlans: settings.disabledPlans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Get disabled plans (public) ───
export const getDisabledPlans = async (req, res) => {
    try {
        const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
        res.json({ disabledPlans: settings?.disabledPlans || [] });
    } catch (err) {
        res.json({ disabledPlans: [] });
    }
};

// ─── One-click server migration ───
export const migrateServer = async (req, res) => {
    try {
        const { targetPanelUrl, targetUsername, targetPassword } = req.body;
        if (!targetPanelUrl || !targetUsername || !targetPassword) {
            return res.status(400).json({ error: 'Target panel URL, username, and password are required' });
        }

        // Login to target panel
        const loginRes = await fetch(`${targetPanelUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(targetUsername)}&password=${encodeURIComponent(targetPassword)}`,
        });
        if (!loginRes.ok) return res.status(400).json({ error: 'Cannot login to target panel' });
        const cookies = loginRes.headers.get('set-cookie');

        // Get all enabled configs
        const configs = await prisma.config.findMany({
            where: { enabled: true },
            include: { user: { select: { name: true, plan: true, speedLimit: true, allowedmaxgb: true, maxConfigs: true } } },
        });

        // Get all source inbounds once
        let sourceInbounds = [];
        try {
            const src = await xuiService.listInbounds();
            sourceInbounds = src.obj || [];
        } catch (e) { }

        let migrated = 0, failed = 0;
        const errors = [];

        for (const cfg of configs) {
            try {
                const sourceInbound = sourceInbounds.find(ib => ib.id === cfg.inboundId);
                if (!sourceInbound) { failed++; errors.push(`${cfg.name}: source inbound not found`); continue; }

                const addRes = await fetch(`${targetPanelUrl}/panel/api/inbounds/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Cookie: cookies },
                    body: JSON.stringify({
                        up: 0, down: 0, total: 0,
                        remark: sourceInbound.remark, enable: true, expiryTime: 0, listen: '',
                        port: sourceInbound.port, protocol: sourceInbound.protocol,
                        settings: sourceInbound.settings, streamSettings: sourceInbound.streamSettings,
                        sniffing: sourceInbound.sniffing,
                        allocate: sourceInbound.allocate || JSON.stringify({ strategy: 'always', refresh: 5, concurrency: 3 }),
                    }),
                });

                if (addRes.ok) {
                    const result = await addRes.json();
                    if (result.success) {
                        const newInboundId = result.obj?.id;
                        if (newInboundId) await prisma.config.update({ where: { id: cfg.id }, data: { inboundId: newInboundId } });
                        migrated++;
                    } else { failed++; errors.push(`${cfg.name}: ${result.msg}`); }
                } else { failed++; errors.push(`${cfg.name}: HTTP ${addRes.status}`); }
            } catch (e) { failed++; errors.push(`${cfg.name}: ${e.message}`); }
        }

        res.json({ message: 'Migration complete', migrated, failed, total: configs.length, errors: errors.slice(0, 20) });
    } catch (err) {
        console.error('Migration error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ─── Exchange rate USD → LKR ───
export const getExchangeRate = async (req, res) => {
    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        const lkr = data.rates?.LKR || 325;
        res.json({ usd: 1, lkr, source: 'exchangerate-api.com', updated: data.date });
    } catch (err) {
        res.json({ usd: 1, lkr: 325, source: 'fallback', updated: new Date().toISOString() });
    }
};

// ─── Get/Update Plans (Limit Configuration) ───
export const getPlans = async (req, res) => {
    try {
        const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
        res.json({ plans: settings?.plans || {} });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updatePlans = async (req, res) => {
    try {
        const { plans } = req.body;
        const settings = await prisma.adminSettings.upsert({
            where: { id: 'global' },
            update: { plans },
            create: { id: 'global', plans },
        });
        res.json({ message: 'Plans updated', plans: settings.plans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Landing Page Plans (DB-driven pricing cards) ───
const DEFAULT_LANDING_PLANS = [
    {
        id: 'FREE', name: 'Starter', price: 0, period: 'forever', popular: false,
        features: ['2 VPN Configs', '10 GB Data', '30 Days Duration', 'VLESS Protocol', 'TCP Network only', 'Basic support'],
        cta: 'Get Started', ctaClass: 'btn-secondary', link: '/signup',
    },
    {
        id: 'PRO', name: 'Pro', price: 5, period: 'month', popular: true,
        features: ['5 VPN Configs', '100 GB Data', '60 Days Duration', 'All 3 Protocols', 'All Networks (TCP/WS/gRPC)', 'Reality + TLS Security', 'Custom Port', 'Unlimited Speed', 'Priority support'],
        cta: 'Start Pro', ctaClass: 'btn-primary', link: '/signup',
    },
    {
        id: 'ENTERPRISE', name: 'Enterprise', price: 15, period: 'month', popular: false,
        features: ['Unlimited Configs', '500 GB Data', '60 Days Duration', 'All Protocols & Security', 'Custom SNI & Fingerprint', 'Unlimited Speed', 'Dedicated server', '24/7 support'],
        cta: 'Contact Sales', ctaClass: 'btn-secondary', link: '/signup',
    },
];

export const getLandingPlans = async (req, res) => {
    try {
        const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
        res.json({ plans: settings?.landingPlans || DEFAULT_LANDING_PLANS });
    } catch (err) {
        res.json({ plans: DEFAULT_LANDING_PLANS });
    }
};

export const updateLandingPlans = async (req, res) => {
    try {
        const { plans } = req.body;
        if (!Array.isArray(plans)) return res.status(400).json({ error: 'Plans must be an array' });
        const settings = await prisma.adminSettings.upsert({
            where: { id: 'global' },
            update: { landingPlans: plans },
            create: { id: 'global', landingPlans: plans },
        });
        res.json({ message: 'Landing plans updated', plans: settings.landingPlans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

