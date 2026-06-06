const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

router.post('/', (req, res) => {
    const { device_info } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO sessions (id, device_info) VALUES (?, ?)').run(
        id, device_info ? JSON.stringify(device_info) : null
    );
    res.json({ id });
});

router.put('/:id/end', (req, res) => {
    db.prepare('UPDATE sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id));
});

router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 50').all());
});

module.exports = router;
