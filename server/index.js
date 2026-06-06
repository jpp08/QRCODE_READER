const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const ENV = process.env.NODE_ENV || 'development';
const PORT = ENV === 'production' ? (process.env.PORT || 5000) : (process.env.API_PORT || 4001);

const IMAGES_DIR = path.join(__dirname, '..', 'data', 'images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '25mb' }));
app.use('/data/images', express.static(IMAGES_DIR));

if (ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'dist')));
}

app.use('/api/scans',    require('./routes/scans'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/export',   require('./routes/export'));

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: require('../package.json').version, env: ENV });
});

if (ENV === 'production') {
    app.get('*', (_req, res) => {
        res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`[API] ${ENV.toUpperCase()} → http://localhost:${PORT}/api`);
});
