import { prisma } from '../config/db.js';
import xuiService from '../services/xui.js';
import { randomUUID } from 'crypto';

// Server-side traffic cache for accurate speed calculation
const trafficCache = new Map(); // key: clientEmail, value: { up, down, timestamp }

// Build branded client email for V2Ray watermark
function buildClientEmail(user, configName) {
    const planTag = (user.plan || 'FREE').toLowerCase();
    const cleanName = user.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
    const cleanConfig = configName ? configName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toLowerCase() : 'cfg';
    const shortId = randomUUID().substring(0, 4);
    // Format: nextbitfree-user-config-abcd
    return `nextbit${planTag}-${cleanName}-${cleanConfig}-${shortId}`;
}

// ─── Check user restrictions ───
function checkRestrictions(user, settings) {
    const restrictions = user.restrictions || {};
    const errors = [];

    if (restrictions.portDisabled && settings.port) {
        errors.push('Custom port selection is disabled for your account');
    }
    if (restrictions.protocolLocked && settings.protocol !== restrictions.protocolLocked) {
        errors.push(`You can only use ${restrictions.protocolLocked.toUpperCase()} protocol`);
    }
    if (restrictions.securityLocked && settings.security !== restrictions.securityLocked) {
        errors.push(`You can only use ${restrictions.securityLocked} security`);
    }
    if (restrictions.networkLocked && settings.network !== restrictions.networkLocked) {
        errors.push(`You can only use ${restrictions.networkLocked} network`);
    }
    if (restrictions.blockedProtocols?.includes(settings.protocol)) {
        errors.push(`${settings.protocol.toUpperCase()} protocol is blocked for your account`);
    }
    if (restrictions.blockedSecurity?.includes(settings.security)) {
        errors.push(`${settings.security} security is blocked for your account`);
    }

    return errors;
}

// ─── Build stream settings for inbound ───
function buildStreamSettings(protocol, security, network, sni, fingerprint, realityKeys = null) {
    const stream = { network, security };

    if (network === 'tcp') stream.tcpSettings = { acceptProxyProtocol: false, header: { type: 'none' } };
    else if (network === 'ws') stream.wsSettings = { path: '/', headers: {} };
    else if (network === 'grpc') stream.grpcSettings = { serviceName: '', multiMode: false };

    if (security === 'tls') {
        stream.tlsSettings = {
            serverName: sni || '',
            fingerprint: fingerprint || 'chrome',
            alpn: ['h2', 'http/1.1'],
            certificates: [{ certificateFile: '', keyFile: '' }],
        };
    } else if (security === 'reality') {
        stream.realitySettings = {
            show: false, xver: 0,
            dest: sni ? `${sni}:443` : 'www.google.com:443',
            serverNames: [sni || 'www.google.com'],
            privateKey: realityKeys?.privateKey || '',
            publicKey: realityKeys?.publicKey || '',
            shortIds: [realityKeys?.shortId || ''],
            fingerprint: fingerprint || 'chrome',
            spiderX: '/',
        };
    }

    return stream;
}

// ─── Create a new V2Ray config ───
// ─── Create a new V2Ray config ───
export const createConfig = async (req, res) => {
    try {
        let {
            name,
            protocol = 'vless',
            port: customPort,
            security = 'none',
            network = 'tcp',
            sni,
            fingerprint,
        } = req.body;
        const userId = req.user.id;

        if (!name) return res.status(400).json({ error: 'Config name is required' });
        if (!['vless', 'vmess', 'trojan'].includes(protocol)) return res.status(400).json({ error: 'Invalid protocol' });
        if (!['none', 'tls', 'reality'].includes(security)) return res.status(400).json({ error: 'Invalid security' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user.currentConfigs >= user.maxConfigs) {
            return res.status(400).json({ error: `Config limit reached (${user.maxConfigs})` });
        }

        // Usage enforcement — block if over data limit
        if (user.currentgb >= user.allowedmaxgb) {
            return res.status(400).json({ error: `Data limit reached (${user.allowedmaxgb} GB). Cannot create more configs.` });
        }

        const restrictionErrors = checkRestrictions(user, { protocol, security, network, port: customPort });
        if (restrictionErrors.length > 0) {
            return res.status(403).json({ error: restrictionErrors[0], allErrors: restrictionErrors });
        }

        // Fetch existing inbounds to check for reuse or collision
        let existingInbounds = [];
        try {
            const listRes = await xuiService.listInbounds();
            if (listRes.success) existingInbounds = listRes.obj || [];
        } catch (e) {
            // If we can't list, we can't reuse safely. But if we try to create a duplicate port, XUI will fail anyway.
            console.warn('Failed to list inbounds, proceeding with blind creation attempt', e);
        }

        let targetInbound = null;
        let assignedPort = customPort;
        let realityKeys = null;

        if (customPort) {
            // User requested a specific port
            const existing = existingInbounds.find(ib => ib.port === customPort);
            if (existing) {
                if (existing.protocol === protocol) {
                    // Match! Reuse this inbound
                    targetInbound = existing;

                    // Adopt the inbound's stream settings for correct connection details
                    try {
                        const stream = JSON.parse(existing.streamSettings || '{}');
                        network = stream.network || 'tcp';
                        security = stream.security || 'none';
                        if (security === 'tls' && stream.tlsSettings) {
                            sni = stream.tlsSettings.serverName || sni;
                            fingerprint = stream.tlsSettings.fingerprint || fingerprint;
                        } else if (security === 'reality' && stream.realitySettings) {
                            sni = stream.realitySettings.serverNames?.[0] || sni;
                            fingerprint = stream.realitySettings.fingerprint || fingerprint;
                            realityKeys = {
                                publicKey: stream.realitySettings.publicKey,
                                shortId: stream.realitySettings.shortIds?.[0]
                            };
                        }
                    } catch (err) {
                        console.warn('Failed to parse existing inbound settings', err);
                    }
                } else {
                    // Conflict: Port exists but wrong protocol
                    return res.status(400).json({ error: `Port ${customPort} is already in use by ${existing.protocol.toUpperCase()}` });
                }
            }
        } else {
            // Random port requested: Find a free one
            let attempts = 0;
            while (attempts < 50) {
                const rand = Math.floor(Math.random() * (65000 - 10000) + 10000);
                if (!existingInbounds.some(ib => ib.port === rand)) {
                    assignedPort = rand;
                    break;
                }
                attempts++;
            }
            if (!assignedPort) return res.status(500).json({ error: 'Could not find a free port' });
        }

        // If no target inbound found (reused), create a new one
        if (!targetInbound) {
            // Generate keys if reality
            if (security === 'reality') {
                try {
                    const keysResult = await xuiService.getNewX25519Cert();
                    if (keysResult.success && keysResult.obj) {
                        realityKeys = {
                            privateKey: keysResult.obj.privateKey,
                            publicKey: keysResult.obj.publicKey,
                            shortId: randomUUID().replace(/-/g, '').substring(0, 8),
                        };
                    }
                } catch (e) { }
            }

            const streamSettings = buildStreamSettings(protocol, security, network, sni, fingerprint, realityKeys);

            const newInboundRes = await xuiService.addInbound({
                up: 0, down: 0, total: 0,
                remark: `${name}-${protocol}`,
                enable: true, expiryTime: 0, listen: '',
                port: assignedPort, protocol,
                settings: JSON.stringify({ clients: [], decryption: 'none', fallbacks: [] }),
                streamSettings: JSON.stringify(streamSettings),
                sniffing: JSON.stringify({ enabled: true, destOverride: ['http', 'tls', 'quic', 'fakedns'], metadataOnly: false, routeOnly: false }),
                allocate: JSON.stringify({ strategy: 'always', refresh: 5, concurrency: 3 }),
            });

            if (!newInboundRes.success) return res.status(500).json({ error: 'Failed to create inbound', details: newInboundRes.msg });

            // Fetch again to get the ID (XUI returns the object on add in some versions, but list is safer)
            const refreshed = await xuiService.listInbounds();
            targetInbound = refreshed.obj?.find(ib => ib.port === assignedPort);
            if (!targetInbound) return res.status(500).json({ error: 'Could not find created inbound' });
        }

        // Add client to targetInbound
        const xrayClientId = randomUUID();
        const clientEmail = buildClientEmail(user, name);
        const expiryTime = Date.now() + 30 * 24 * 60 * 60 * 1000;

        // Speed limit (Mbps → KB/s: 1 Mbps = 128 KB/s for network bits, but XUI uses bytes so 1 Mbps ≈ 128 KB/s)
        let speedLimitKBs = 0;
        if (user.speedLimit > 0) {
            speedLimitKBs = user.speedLimit * 128;
        } else {
            try {
                const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
                if (settings?.defaultSpeedLimit > 0) speedLimitKBs = settings.defaultSpeedLimit * 128;
            } catch (e) { }
        }

        let clientConfig;
        if (protocol === 'trojan') {
            clientConfig = {
                password: xrayClientId, email: clientEmail, limitIp: 2,
                totalGB: user.allowedmaxgb * 1073741824 / user.maxConfigs,
                expiryTime, enable: true, tgId: '', subId: '', comment: name,
            };
        } else {
            clientConfig = {
                id: xrayClientId, email: clientEmail, limitIp: 2,
                totalGB: user.allowedmaxgb * 1073741824 / user.maxConfigs,
                expiryTime, enable: true, tgId: '', subId: '', comment: name,
                flow: protocol === 'vless' ? (security === 'reality' ? 'xtls-rprx-vision' : '') : undefined,
                alterId: protocol === 'vmess' ? 0 : undefined,
            };
        }
        if (speedLimitKBs > 0) clientConfig.limitSpeed = speedLimitKBs;

        const addResult = await xuiService.addClient({ id: targetInbound.id, settings: JSON.stringify({ clients: [clientConfig] }) });
        if (!addResult.success) return res.status(500).json({ error: 'Failed to add client', details: addResult.msg });

        const v2rayUrl = xuiService.buildV2RayUrl(protocol, xrayClientId, targetInbound, name);

        const config = await prisma.config.create({
            data: {
                userId, xrayClientId, inboundId: targetInbound.id, name, protocol, v2rayUrl, enabled: true,
                expiryDate: new Date(expiryTime), port: assignedPort, security, network,
                sni: sni || null, fingerprint: fingerprint || null,
                clientEmail,
            },
        });

        await prisma.user.update({ where: { id: userId }, data: { currentConfigs: { increment: 1 } } });

        res.status(201).json({
            message: 'Config created successfully',
            config: { ...config, v2rayUrl, realityPublicKey: realityKeys?.publicKey || null },
        });
    } catch (error) {
        console.error('Create config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── Get all configs for user with live stats ───
export const getUserConfigs = async (req, res) => {
    try {
        const configs = await prisma.config.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
        });

        // Try to get online clients, but don't fail if XUI is down
        let onlineEmails = [];
        try {
            const onlineResult = await xuiService.getOnlineClients();
            if (onlineResult.success) onlineEmails = onlineResult.obj || [];
        } catch (e) {
            console.warn('XUI panel unreachable for online check');
        }

        const enriched = await Promise.all(
            configs.map(async (cfg) => {
                const clientEmail = cfg.clientEmail || `${cfg.userId}-${cfg.name}`.replace(/\s+/g, '-').toLowerCase();
                let traffic = { up: 0, down: 0 };
                let connectedIps = [];
                let speed = { up: 0, down: 0 };

                try {
                    const trafficResult = await xuiService.getClientTraffic(clientEmail);
                    if (trafficResult.success && trafficResult.obj) {
                        traffic = { up: trafficResult.obj.up || 0, down: trafficResult.obj.down || 0 };
                    }
                } catch (e) { }

                // Server-side speed calculation using cached traffic
                const now = Date.now();
                const cached = trafficCache.get(clientEmail);
                if (cached && (now - cached.timestamp) > 500) {
                    const timeDiffSec = (now - cached.timestamp) / 1000;
                    speed.up = Math.max(0, (traffic.up - cached.up) / timeDiffSec);
                    speed.down = Math.max(0, (traffic.down - cached.down) / timeDiffSec);
                }
                trafficCache.set(clientEmail, { up: traffic.up, down: traffic.down, timestamp: now });

                try {
                    const ipResult = await xuiService.getClientIps(clientEmail);
                    if (ipResult.success && ipResult.obj) {
                        const raw = ipResult.obj;
                        if (typeof raw === 'string' && raw !== 'No IP Record') {
                            try { connectedIps = JSON.parse(raw); } catch (e) { connectedIps = []; }
                        } else if (Array.isArray(raw)) {
                            connectedIps = raw;
                        }
                    }
                } catch (e) { }

                return {
                    ...cfg,
                    traffic,
                    speed,
                    totalUsageGB: ((traffic.up + traffic.down) / 1073741824).toFixed(2),
                    isOnline: onlineEmails.includes(clientEmail),
                    connectedIps: Array.isArray(connectedIps) ? connectedIps : [],
                };
            })
        );

        const totalUsageBytes = enriched.reduce((sum, c) => sum + c.traffic.up + c.traffic.down, 0);

        res.json({
            configs: enriched,
            summary: {
                totalConfigs: configs.length,
                maxConfigs: req.user.maxConfigs,
                totalUsageGB: (totalUsageBytes / 1073741824).toFixed(2),
                allowedMaxGB: req.user.allowedmaxgb,
                onlineCount: enriched.filter((c) => c.isOnline).length,
            },
        });
    } catch (error) {
        console.error('Get user configs error:', error);
        // Still return DB data even if XUI fails
        try {
            const configs = await prisma.config.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' },
            });
            res.json({
                configs: configs.map(c => ({ ...c, traffic: { up: 0, down: 0 }, totalUsageGB: '0.00', isOnline: false, connectedIps: [] })),
                summary: { totalConfigs: configs.length, maxConfigs: req.user.maxConfigs, totalUsageGB: '0.00', allowedMaxGB: req.user.allowedmaxgb, onlineCount: 0 },
                panelOffline: true,
            });
        } catch (dbErr) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

// ─── Get single config detail ───
export const getConfigDetail = async (req, res) => {
    try {
        const config = await prisma.config.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });

        if (!config) return res.status(404).json({ error: 'Config not found' });

        const clientEmail = config.clientEmail || `${config.userId}-${config.name}`.replace(/\s+/g, '-').toLowerCase();
        let traffic = { up: 0, down: 0 };
        let ips = [];
        let isOnline = false;

        try {
            const trafficResult = await xuiService.getClientTraffic(clientEmail);
            if (trafficResult.success && trafficResult.obj) {
                traffic = { up: trafficResult.obj.up || 0, down: trafficResult.obj.down || 0 };
            }
        } catch (e) { }

        try {
            const ipResult = await xuiService.getClientIps(clientEmail);
            if (ipResult.success && ipResult.obj) {
                const raw = ipResult.obj;
                ips = typeof raw === 'string' && raw !== 'No IP Record' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
            }
        } catch (e) { }

        try {
            const onlineResult = await xuiService.getOnlineClients();
            if (onlineResult.success) isOnline = (onlineResult.obj || []).includes(clientEmail);
        } catch (e) { }

        res.json({
            ...config,
            traffic,
            totalUsageGB: ((traffic.up + traffic.down) / 1073741824).toFixed(2),
            isOnline,
            connectedIps: Array.isArray(ips) ? ips : [],
        });
    } catch (error) {
        console.error('Get config detail error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── Delete config ───
export const deleteConfig = async (req, res) => {
    try {
        const config = await prisma.config.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });

        if (!config) return res.status(404).json({ error: 'Config not found' });

        console.log(`[DELETE] Attempting to delete config ${config.id} (Inbound: ${config.inboundId}, Client: ${config.xrayClientId})`);

        // Remove from XUI
        try {
            const delResult = await xuiService.deleteClient(config.inboundId, config.xrayClientId);
            console.log(`[DELETE] XUI result:`, delResult);

            if (!delResult.success) {
                console.warn(`[DELETE] Failed to delete client from XUI: ${delResult.msg}`);
                // If the error is "client not found", we should still proceed to delete from DB
                if (!delResult.msg?.toLowerCase().includes('not found')) {
                    // For other errors, maybe we should stop? But user wants to delete.
                    // Let's log it but allow DB delete so user isn't stuck with a "zombie" config.
                }
            }
        } catch (xuiErr) {
            console.error(`[DELETE] XUI Exception:`, xuiErr.message);
            // Continue with DB deletion even if XUI deletion fails
        }

        await prisma.config.delete({ where: { id: config.id } });
        await prisma.user.update({
            where: { id: req.user.id },
            data: { currentConfigs: { decrement: 1 } },
        });

        res.json({ message: 'Config deleted successfully' });
    } catch (error) {
        console.error('Delete config error:', error);
        res.status(500).json({ error: 'Failed to delete config: ' + (error.message || 'Unknown error') });
    }
};

// ─── Update config (Rename or Regenerate UUID) ───
export const updateConfig = async (req, res) => {
    try {
        const { name, regenerateId } = req.body;
        const config = await prisma.config.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });

        if (!config) return res.status(404).json({ error: 'Config not found' });

        const data = {};
        if (name) data.name = name;

        // If regenerating UUID
        if (regenerateId) {
            const newUuid = randomUUID();
            const updateXui = await xuiService.updateClient(config.xrayClientId, {
                id: newUuid,
                email: config.clientEmail, // keep email same
                enable: true
            });

            if (!updateXui.success) {
                return res.status(500).json({ error: 'Failed to update remote server', details: updateXui.msg });
            }

            data.xrayClientId = newUuid;

            // Re-build V2Ray URL with new ID
            try {
                const inboundRes = await xuiService.getInbound(config.inboundId);
                if (inboundRes.success && inboundRes.obj) {
                    data.v2rayUrl = xuiService.buildV2RayUrl(config.protocol, newUuid, inboundRes.obj);
                }
            } catch (e) { }
        }

        const updated = await prisma.config.update({
            where: { id: config.id },
            data,
        });

        res.json({ message: 'Config updated', config: updated });
    } catch (error) {
        console.error('Update config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── Get user restrictions (for frontend to check) ───
export const getUserRestrictions = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        res.json({ restrictions: user.restrictions || {} });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
