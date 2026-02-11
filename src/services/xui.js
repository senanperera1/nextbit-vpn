import 'dotenv/config';
import 'dotenv/config';
import { prisma } from '../config/db.js';

class XUIService {
    constructor() {
        this.baseUrl = process.env.XUI_PANEL_URL;
        this.username = process.env.XUI_USERNAME;
        this.password = process.env.XUI_PASSWORD;
        this.sessionCookie = null;

        // Backup panel
        this.backupUrl = null;
        this.backupUser = null;
        this.backupPass = null;
        this.backupCookie = null;
        this.usingBackup = false;
    }

    // Load backup panel credentials from AdminSettings
    async loadBackupConfig() {
        try {
            const settings = await prisma.adminSettings.findUnique({ where: { id: 'global' } });
            if (settings?.backupPanelUrl) {
                this.backupUrl = settings.backupPanelUrl;
                this.backupUser = settings.backupPanelUser;
                this.backupPass = settings.backupPanelPass;
            }
        } catch (e) {
            // ignore — table might not exist yet
        }
    }

    get activeUrl() {
        return this.usingBackup ? this.backupUrl : this.baseUrl;
    }

    get activeCookie() {
        return this.usingBackup ? this.backupCookie : this.sessionCookie;
    }

    set activeCookie(val) {
        if (this.usingBackup) this.backupCookie = val;
        else this.sessionCookie = val;
    }

    // Authenticate with 3X-UI panel and store session cookie
    async login(forceBackup = false) {
        const url = forceBackup ? this.backupUrl : this.activeUrl;
        const user = forceBackup ? this.backupUser : (this.usingBackup ? this.backupUser : this.username);
        const pass = forceBackup ? this.backupPass : (this.usingBackup ? this.backupPass : this.password);

        const res = await fetch(`${url}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass }),
        });

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) {
            const cookie = setCookie.split(';')[0];
            if (forceBackup) this.backupCookie = cookie;
            else this.activeCookie = cookie;
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error('3X-UI login failed: ' + JSON.stringify(data));
        }
        return data;
    }

    // Make an authenticated API call with auto-failover to backup
    async request(method, path, body = null) {
        if (!this.activeCookie) {
            await this.login();
        }

        const doRequest = async (url, cookie) => {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: cookie,
                },
            };
            if (body) options.body = JSON.stringify(body);

            const res = await fetch(`${url}/panel/api/inbounds${path}`, options);
            let data;
            try {
                data = await res.json();
            } catch (parseErr) {
                // Response is not valid JSON
                const text = await res.text();
                throw new Error(`XUI API returned invalid JSON (Status ${res.status}): ${text.substring(0, 200)}`);
            }
            return { res, data };
        };

        try {
            let { res, data } = await doRequest(this.activeUrl, this.activeCookie);

            // Session expired — re-login and retry
            if (!data.success && res.status === 401) {
                await this.login();
                ({ res, data } = await doRequest(this.activeUrl, this.activeCookie));
            }

            if (!data.success) throw new Error(data.msg || 'Request failed');
            return data;
        } catch (err) {
            // Try backup panel if primary fails
            if (!this.usingBackup && this.backupUrl) {
                console.warn(`Primary panel failed, switching to backup: ${err.message}`);
                this.usingBackup = true;
                try {
                    await this.login();
                    const { data } = await doRequest(this.backupUrl, this.backupCookie);
                    return data;
                } catch (backupErr) {
                    this.usingBackup = false;
                    throw new Error(`Both panels failed. Primary: ${err.message}. Backup: ${backupErr.message}`);
                }
            }
            throw err;
        }
    }

    // ─── Inbound Methods ───

    async listInbounds() {
        return this.request('GET', '/list');
    }

    async getInbound(id) {
        return this.request('GET', `/get/${id}`);
    }

    async addInbound(inboundConfig) {
        return this.request('POST', '/add', inboundConfig);
    }

    async deleteInbound(id) {
        return this.request('POST', `/del/${id}`);
    }

    async updateInbound(id, inboundConfig) {
        return this.request('POST', `/update/${id}`, inboundConfig);
    }

    // ─── Client Methods ───

    async addClient(clientData) {
        return this.request('POST', '/addClient', clientData);
    }

    async updateClient(clientId, clientData) {
        return this.request('POST', `/updateClient/${clientId}`, clientData);
    }

    async deleteClient(inboundId, clientId) {
        return this.request('POST', `/${inboundId}/delClient/${clientId}`);
    }

    async getClientTraffic(email) {
        return this.request('GET', `/getClientTraffics/${email}`);
    }

    async getClientTrafficById(clientId) {
        return this.request('GET', `/getClientTrafficsById/${clientId}`);
    }

    async getClientIps(email) {
        return this.request('POST', `/clientIps/${email}`);
    }

    async resetClientTraffic(inboundId, email) {
        return this.request('POST', `/${inboundId}/resetClientTraffic/${email}`);
    }

    // ─── Status Methods ───

    async getOnlineClients() {
        return this.request('POST', '/onlines');
    }

    // ─── Server Methods ───

    async getServerStatus() {
        if (!this.activeCookie) await this.login();
        const res = await fetch(`${this.activeUrl}/panel/api/server/status`, {
            headers: { Cookie: this.activeCookie },
        });
        return res.json();
    }

    // ─── Reality Key Generation ───

    async getNewX25519Cert() {
        if (!this.activeCookie) await this.login();
        const res = await fetch(`${this.activeUrl}/panel/api/server/getNewX25519Cert`, {
            headers: { Cookie: this.activeCookie },
        });
        return res.json();
    }

    // ─── Helper: Generate a new UUID from 3X-UI ───

    async getNewUUID() {
        if (!this.activeCookie) await this.login();
        const res = await fetch(`${this.activeUrl}/panel/api/server/getNewUUID`, {
            headers: { Cookie: this.activeCookie },
        });
        return res.json();
    }

    // ─── Panel Health Check ───

    async healthCheck(url = null) {
        const target = url || this.activeUrl;
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${target}/login`, {
                method: 'HEAD',
                signal: controller.signal,
            });
            return { online: res.ok, url: target };
        } catch {
            return { online: false, url: target };
        }
    }

    // ─── Helper: Build V2Ray URL from client + inbound data ───

    buildV2RayUrl(protocol, clientId, inbound, remark = null) {
        const address = inbound.address || inbound.listen || 'senan.cyberghostvpn.shop';
        const port = inbound.port;
        const streamSettings = JSON.parse(inbound.streamSettings || '{}');
        const network = streamSettings.network || 'tcp';
        const security = streamSettings.security || 'none';
        const configName = remark || inbound.remark || 'config';

        switch (protocol) {
            case 'vless': {
                let url = `vless://${clientId}@${address}:${port}?type=${network}&security=${security}`;
                // Add encryption=none for VLESS (standard practice)
                url += `&encryption=none`;

                if (security === 'tls' && streamSettings.tlsSettings) {
                    const sni = streamSettings.tlsSettings.serverName || address;
                    url += `&sni=${sni}`;
                    if (streamSettings.tlsSettings.fingerprint) {
                        url += `&fp=${streamSettings.tlsSettings.fingerprint}`;
                    }
                    if (streamSettings.tlsSettings.alpn && streamSettings.tlsSettings.alpn.length > 0) {
                        url += `&alpn=${encodeURIComponent(streamSettings.tlsSettings.alpn.join(','))}`;
                    }
                }
                if (security === 'reality' && streamSettings.realitySettings) {
                    const rs = streamSettings.realitySettings;
                    url += `&sni=${rs.serverNames?.[0] || ''}&pbk=${rs.publicKey || ''}&sid=${rs.shortIds?.[0] || ''}&fp=${rs.fingerprint || 'chrome'}&type=${network}`;
                }
                if (network === 'ws' && streamSettings.wsSettings) {
                    url += `&path=${encodeURIComponent(streamSettings.wsSettings.path || '/')}`;
                    if (streamSettings.wsSettings.headers?.Host) {
                        url += `&host=${encodeURIComponent(streamSettings.wsSettings.headers.Host)}`;
                    }
                }
                if (network === 'grpc' && streamSettings.grpcSettings) {
                    url += `&serviceName=${streamSettings.grpcSettings.serviceName || ''}`;
                }
                url += `#${encodeURIComponent(configName)}`;
                return url;
            }
            case 'vmess': {
                const vmessConfig = {
                    v: '2',
                    ps: configName,
                    add: address,
                    port: port,
                    id: clientId,
                    aid: 0,
                    net: network,
                    type: 'none',
                    host: '',
                    path: '',
                    tls: security === 'tls' ? 'tls' : '',
                };
                if (network === 'ws' && streamSettings.wsSettings) {
                    vmessConfig.path = streamSettings.wsSettings.path || '/';
                    vmessConfig.host = streamSettings.wsSettings.headers?.Host || '';
                }
                return 'vmess://' + Buffer.from(JSON.stringify(vmessConfig)).toString('base64');
            }
            case 'trojan': {
                let url = `trojan://${clientId}@${address}:${port}?type=${network}&security=${security}`;
                if (security === 'tls' && streamSettings.tlsSettings) {
                    url += `&sni=${streamSettings.tlsSettings.serverName || address}`;
                }
                url += `#${encodeURIComponent(configName)}`;
                return url;
            }
            default:
                return `${protocol}://${clientId}@${address}:${port}`;
        }
    }
}

// Singleton instance
const xuiService = new XUIService();
// Load backup config on startup
xuiService.loadBackupConfig().catch(() => { });

export default xuiService;
