import express from 'express';
import { config } from 'dotenv';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vpnAuthRoutes from './routes/vpnauth.js';
import configRoutes from './routes/config.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import premadeRoutes from './routes/premade.js';
import publicStatsRoutes from './routes/publicstats.js';
import noticeRoutes from './routes/notice.js';
import { connectDB } from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

config();
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend files
app.use(express.static(join(__dirname, '..', 'public')));

// API Routes
app.use('/auth', vpnAuthRoutes);
app.use('/config', configRoutes);
app.use('/admin', adminRoutes);
app.use('/settings', settingsRoutes);
app.use('/premade', premadeRoutes);
app.use('/api/stats/public', publicStatsRoutes);
app.use('/api/notices', noticeRoutes);

// Page routes
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'signup.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('/admin-panel', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/verify', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'verify.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
