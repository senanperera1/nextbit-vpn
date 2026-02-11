import { prisma } from '../config/db.js';
import xuiService from '../services/xui.js';
import { randomUUID } from 'crypto';

// Build branded client email for V2Ray watermark
function buildClientEmail(user, configName) {
    const planTag = (user.plan || 'FREE').toLowerCase();
    const cleanName = user.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
    const cleanConfig = configName ? configName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toLowerCase() : 'cfg';
    const shortId = randomUUID().substring(0, 4);
    // Format: nextbitfree-user-config-abcd
    return `nextbit${planTag}-${cleanName}-${cleanConfig}-${shortId}`;
}

// ─── Admin: Create premade config ───
export const createPremade = async (req, res) => {
    try {
        const { name, description, protocol, port, security, network, sni, fingerprint, dataGB, durationDays, paidOnly, promotional } = req.body;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        const premade = await prisma.premadeConfig.create({
            data: {
                name,
                description: description || null,
                protocol: protocol || 'vless',
                port: port || 0,
                security: security || 'reality',
                network: network || 'tcp',
                sni: sni || null,
                fingerprint: fingerprint || 'chrome',
                dataGB: dataGB || 10,
                durationDays: durationDays || 30,
                paidOnly: paidOnly || false,
                promotional: promotional || false,
                enabled: true,
            },
        });

        res.status(201).json({ message: 'Premade config created', premade });
    } catch (err) {
        console.error('Create premade error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── Admin: List all premade configs ───
export const listPremadeAdmin = async (req, res) => {
    try {
        const premades = await prisma.premadeConfig.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ premades });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── Admin: Update premade config ───
export const updatePremade = async (req, res) => {
    try {
        const { name, description, protocol, port, security, network, sni, fingerprint, dataGB, durationDays, paidOnly, promotional, enabled } = req.body;
        const premade = await prisma.premadeConfig.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(protocol !== undefined && { protocol }),
                ...(port !== undefined && { port }),
                ...(security !== undefined && { security }),
                ...(network !== undefined && { network }),
                ...(sni !== undefined && { sni }),
                ...(fingerprint !== undefined && { fingerprint }),
                ...(dataGB !== undefined && { dataGB }),
                ...(durationDays !== undefined && { durationDays }),
                ...(paidOnly !== undefined && { paidOnly }),
                ...(promotional !== undefined && { promotional }),
                ...(enabled !== undefined && { enabled }),
            },
        });
        res.json({ message: 'Premade config updated', premade });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── Admin: Delete premade config ───
export const deletePremade = async (req, res) => {
    try {
        await prisma.premadeConfig.delete({ where: { id: req.params.id } });
        res.json({ message: 'Premade config deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── User: List available premade configs (filtered by plan) ───
export const listPremadeUser = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const isPaid = user.plan !== 'FREE';

        const premades = await prisma.premadeConfig.findMany({
            where: {
                enabled: true,
                ...(isPaid ? {} : { paidOnly: false }),
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ premades, userPlan: user.plan });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── User: Activate a premade config ───
export const activatePremade = async (req, res) => {
    try {
        const premade = await prisma.premadeConfig.findUnique({ where: { id: req.params.id } });
        if (!premade || !premade.enabled) {
            return res.status(404).json({ error: 'Premade config not found or disabled' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });

        // Check plan access
        if (premade.paidOnly && user.plan === 'FREE') {
            return res.status(403).json({ error: 'This config requires a paid plan' });
        }

        // Check config limit
        if (user.currentConfigs >= user.maxConfigs) {
            return res.status(400).json({ error: `Config limit reached (${user.maxConfigs})` });
        }

        // Check GB limit
        if (user.currentgb + premade.dataGB > user.allowedmaxgb) {
            return res.status(400).json({ error: `Not enough data allowance. Need ${premade.dataGB}GB, have ${user.allowedmaxgb - user.currentgb}GB remaining` });
        }

        const configName = `${premade.name}-${Date.now().toString(36)}`;
        const assignedPort = premade.port || Math.floor(Math.random() * (65000 - 10000) + 10000);
        const protocol = premade.protocol;
        const security = premade.security;
        const network = premade.network;

        // Check if an inbound with this port already exists
        const allInbounds = await xuiService.listInbounds();
        let inbound = allInbounds.obj?.find(ib => ib.port === assignedPort && ib.protocol === protocol);

        // If inbound exists, we reuse it. If not, we create one.
        if (!inbound) {
            // Get Reality keys if needed
            let realityKeys = null;
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

            // Build stream settings
            const stream = { network, security };
            if (network === 'tcp') stream.tcpSettings = { acceptProxyProtocol: false, header: { type: 'none' } };
            else if (network === 'ws') stream.wsSettings = { path: '/', headers: {} };
            else if (network === 'grpc') stream.grpcSettings = { serviceName: '', multiMode: false };

            if (security === 'tls') {
                stream.tlsSettings = {
                    serverName: premade.sni || '',
                    fingerprint: premade.fingerprint || 'chrome',
                    alpn: ['h2', 'http/1.1'],
                    certificates: [{ certificateFile: '', keyFile: '' }],
                };
            } else if (security === 'reality' && realityKeys) {
                stream.realitySettings = {
                    show: false, xver: 0,
                    dest: premade.sni ? `${premade.sni}:443` : 'www.google.com:443',
                    serverNames: [premade.sni || 'www.google.com'],
                    privateKey: realityKeys.privateKey,
                    publicKey: realityKeys.publicKey,
                    shortIds: [realityKeys.shortId],
                    fingerprint: premade.fingerprint || 'chrome',
                    spiderX: '/',
                };
            }

            // Create inbound
            const newInbound = await xuiService.addInbound({
                up: 0, down: 0, total: 0,
                remark: `${configName}-${protocol}`,
                enable: true, expiryTime: 0, listen: '',
                port: assignedPort, protocol,
                settings: JSON.stringify({ clients: [], decryption: 'none', fallbacks: [] }),
                streamSettings: JSON.stringify(stream),
                sniffing: JSON.stringify({ enabled: true, destOverride: ['http', 'tls', 'quic', 'fakedns'], metadataOnly: false, routeOnly: false }),
                allocate: JSON.stringify({ strategy: 'always', refresh: 5, concurrency: 3 }),
            });

            if (!newInbound.success) {
                return res.status(500).json({ error: 'Failed to create inbound', details: newInbound.msg });
            }

            // Fetch the newly created inbound
            const refreshed = await xuiService.listInbounds();
            inbound = refreshed.obj?.find(ib => ib.port === assignedPort);
        }

        if (!inbound) return res.status(500).json({ error: 'Could not find or create inbound' });

        const xrayClientId = randomUUID();
        const clientEmail = buildClientEmail(user, premade.name);
        const expiryTime = Date.now() + premade.durationDays * 24 * 60 * 60 * 1000;
        const totalBytes = premade.dataGB * 1073741824;

        // Speed limit from user setting or admin default
        let speedLimitKBs = 0;
        if (user.speedLimit > 0) {
            speedLimitKBs = user.speedLimit * 128; // Mbps to KB/s
        } else {
            try {
                const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
                if (settings?.defaultSpeedLimit > 0) speedLimitKBs = settings.defaultSpeedLimit * 128;
            } catch (e) { }
        }

        let clientConfig;
        if (protocol === 'trojan') {
            clientConfig = { password: xrayClientId, email: clientEmail, limitIp: 2, totalGB: totalBytes, expiryTime, enable: true, tgId: '', subId: '', comment: configName };
        } else {
            clientConfig = {
                id: xrayClientId, email: clientEmail, limitIp: 2, totalGB: totalBytes, expiryTime, enable: true, tgId: '', subId: '', comment: configName,
                flow: protocol === 'vless' ? (security === 'reality' ? 'xtls-rprx-vision' : '') : undefined,
                alterId: protocol === 'vmess' ? 0 : undefined,
            };
        }
        if (speedLimitKBs > 0) clientConfig.limitSpeed = speedLimitKBs;

        const addResult = await xuiService.addClient({ id: inbound.id, settings: JSON.stringify({ clients: [clientConfig] }) });
        if (!addResult.success) return res.status(500).json({ error: 'Failed to add client', details: addResult.msg });

        // Generate V2Ray URL with client email as the remark
        const v2rayUrl = xuiService.buildV2RayUrl(protocol, xrayClientId, inbound, clientEmail);

        // Save to DB
        const config = await prisma.config.create({
            data: {
                userId: user.id, xrayClientId, inboundId: inbound.id, name: configName, protocol, v2rayUrl, enabled: true,
                expiryDate: new Date(expiryTime), port: assignedPort, security, network,
                sni: premade.sni || null, fingerprint: premade.fingerprint || null,
                clientEmail,
            },
        });

        // Update user: increment configs, skip GB deduction for promotional
        const updateData = { currentConfigs: { increment: 1 } };
        if (!premade.promotional) {
            updateData.currentgb = { increment: premade.dataGB };
        }
        await prisma.user.update({ where: { id: user.id }, data: updateData });

        // Extract reality public key from inbound for the response
        let realityPublicKey = null;
        try {
            const ss = JSON.parse(inbound.streamSettings || '{}');
            if (ss.realitySettings?.publicKey) realityPublicKey = ss.realitySettings.publicKey;
        } catch (e) { }

        res.status(201).json({
            message: premade.promotional
                ? 'Promotional config activated — no data deducted!'
                : 'Config activated from premade template',
            config: { ...config, v2rayUrl, realityPublicKey },
            premade: { name: premade.name, dataGB: premade.dataGB, durationDays: premade.durationDays, promotional: premade.promotional },
        });
    } catch (err) {
        console.error('Activate premade error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
