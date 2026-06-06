const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');

function saveBase64(b64, scanUuid, type) {
    if (!b64) return null;
    const ext = type === 'raw' ? 'jpg' : 'png';
    const filename = `${scanUuid}_${type}.${ext}`;
    const raw = b64.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(IMAGES_DIR, filename), Buffer.from(raw, 'base64'));
    return filename;
}

// POST /api/scans
router.post('/', (req, res) => {
    try {
        const b = req.body;
        const uid = uuidv4();

        const raw = saveBase64(b.image_raw, uid, 'raw');
        const bin = saveBase64(b.image_binary, uid, 'binary');

        const stmt = db.prepare(`
            INSERT INTO scans (
                session_id, decoded_text, format, read_success, source, scan_duration_ms, device_label,
                image_raw_path, frame_width, frame_height,
                image_binary_path, threshold_value, threshold_method,
                finder_patterns, finder_score, homography_matrix, rotation_angle,
                matrix_data, matrix_width, matrix_height, qr_version,
                mask_pattern, ec_level, ec_codewords_total, ec_errors_detected, ec_errors_corrected,
                raw_result, notes
            ) VALUES (
                @session_id, @decoded_text, @format, @read_success, @source, @scan_duration_ms, @device_label,
                @image_raw_path, @frame_width, @frame_height,
                @image_binary_path, @threshold_value, @threshold_method,
                @finder_patterns, @finder_score, @homography_matrix, @rotation_angle,
                @matrix_data, @matrix_width, @matrix_height, @qr_version,
                @mask_pattern, @ec_level, @ec_codewords_total, @ec_errors_detected, @ec_errors_corrected,
                @raw_result, @notes
            )
        `);

        const result = stmt.run({
            session_id:         b.session_id      ?? null,
            decoded_text:       b.decoded_text     ?? null,
            format:             b.format           ?? null,
            read_success:       b.read_success     ?? 1,
            source:             b.source           ?? 'camera',
            scan_duration_ms:   b.scan_duration_ms ?? null,
            device_label:       b.device_label     ?? null,
            image_raw_path:     raw,
            frame_width:        b.frame_width      ?? null,
            frame_height:       b.frame_height     ?? null,
            image_binary_path:  bin,
            threshold_value:    b.threshold_value  ?? null,
            threshold_method:   b.threshold_method ?? null,
            finder_patterns:    b.finder_patterns  ? JSON.stringify(b.finder_patterns) : null,
            finder_score:       b.finder_score     ?? null,
            homography_matrix:  b.homography_matrix ? JSON.stringify(b.homography_matrix) : null,
            rotation_angle:     b.rotation_angle   ?? null,
            matrix_data:        b.matrix_data      ?? null,
            matrix_width:       b.matrix_width     ?? null,
            matrix_height:      b.matrix_height    ?? null,
            qr_version:         b.qr_version       ?? null,
            mask_pattern:       b.mask_pattern     ?? null,
            ec_level:           b.ec_level         ?? null,
            ec_codewords_total: b.ec_codewords_total  ?? null,
            ec_errors_detected: b.ec_errors_detected  ?? null,
            ec_errors_corrected:b.ec_errors_corrected ?? null,
            raw_result:         b.raw_result ? JSON.stringify(b.raw_result) : null,
            notes:              b.notes            ?? null,
        });

        if (b.session_id) {
            db.prepare(`
                UPDATE sessions
                SET scan_count = scan_count + 1,
                    success_count = success_count + ?
                WHERE id = ?
            `).run(b.read_success ? 1 : 0, b.session_id);
        }

        res.json({ id: result.lastInsertRowid });
    } catch (err) {
        console.error('[POST /api/scans]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scans
router.get('/', (req, res) => {
    const { limit = 100, offset = 0, format, session_id, success, search } = req.query;
    const where = [];
    const params = {};

    if (format)     { where.push('format = @format');               params.format = format; }
    if (session_id) { where.push('session_id = @session_id');       params.session_id = session_id; }
    if (success !== undefined) { where.push('read_success = @success'); params.success = +success; }
    if (search)     { where.push('decoded_text LIKE @search');      params.search = `%${search}%`; }

    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
        SELECT id, session_id, timestamp, decoded_text, format, read_success,
               source, scan_duration_ms, device_label, frame_width, frame_height,
               image_raw_path, image_binary_path,
               threshold_value, threshold_method,
               matrix_width, matrix_height, qr_version,
               mask_pattern, ec_level, ec_errors_detected, ec_errors_corrected
        FROM scans ${w}
        ORDER BY timestamp DESC
        LIMIT @limit OFFSET @offset
    `).all({ ...params, limit: +limit, offset: +offset });

    const { n } = db.prepare(`SELECT COUNT(*) as n FROM scans ${w}`).get(params);
    res.json({ rows, total: n, limit: +limit, offset: +offset });
});

// GET /api/scans/stats
router.get('/stats', (req, res) => {
    const stats = db.prepare(`
        SELECT
            COUNT(*)                                      AS total,
            SUM(read_success)                             AS success,
            COUNT(*) - SUM(read_success)                 AS failed,
            ROUND(AVG(scan_duration_ms), 1)              AS avg_duration_ms,
            COUNT(DISTINCT format)                        AS formats_seen,
            COUNT(DISTINCT session_id)                    AS sessions
        FROM scans
    `).get();

    const byFormat = db.prepare(`
        SELECT format, COUNT(*) as n
        FROM scans WHERE read_success = 1
        GROUP BY format ORDER BY n DESC
    `).all();

    const recent = db.prepare(`
        SELECT timestamp, decoded_text, format, scan_duration_ms, read_success
        FROM scans ORDER BY timestamp DESC LIMIT 10
    `).all();

    res.json({ stats, byFormat, recent });
});

// GET /api/scans/:id
router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
});

// DELETE /api/scans/:id
router.delete('/:id', (req, res) => {
    const row = db.prepare('SELECT image_raw_path, image_binary_path FROM scans WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    [row.image_raw_path, row.image_binary_path].forEach(f => {
        if (f) { const p = path.join(IMAGES_DIR, f); if (fs.existsSync(p)) fs.unlinkSync(p); }
    });
    db.prepare('DELETE FROM scans WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
});

module.exports = router;
