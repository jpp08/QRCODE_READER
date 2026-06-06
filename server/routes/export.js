const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/export?format=json|csv|jsonl&include_matrix=true
router.get('/', (req, res) => {
    const { format = 'json', include_matrix = 'false' } = req.query;

    let cols = `id, timestamp, decoded_text, format, read_success, source,
                scan_duration_ms, frame_width, frame_height,
                threshold_value, threshold_method,
                matrix_width, matrix_height, qr_version,
                mask_pattern, ec_level, ec_codewords_total,
                ec_errors_detected, ec_errors_corrected,
                image_raw_path, image_binary_path`;

    if (include_matrix === 'true') cols += ', matrix_data';

    const rows = db.prepare(`SELECT ${cols} FROM scans ORDER BY timestamp`).all();

    if (format === 'csv') {
        if (!rows.length) return res.send('');
        const headers = Object.keys(rows[0]).join(',');
        const lines = rows.map(r =>
            Object.values(r).map(v =>
                v == null ? '' : `"${String(v).replace(/"/g, '""')}"`
            ).join(',')
        );
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="scans_export.csv"');
        return res.send([headers, ...lines].join('\n'));
    }

    if (format === 'jsonl') {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Content-Disposition', 'attachment; filename="scans_export.jsonl"');
        return res.send(rows.map(r => JSON.stringify(r)).join('\n'));
    }

    res.setHeader('Content-Disposition', 'attachment; filename="scans_export.json"');
    res.json(rows);
});

module.exports = router;
