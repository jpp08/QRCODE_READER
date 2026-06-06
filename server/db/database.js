const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
[DATA_DIR, IMAGES_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const db = new Database(path.join(DATA_DIR, 'qrcode_reader.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id            TEXT PRIMARY KEY,
        started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at      DATETIME,
        device_info   TEXT,
        scan_count    INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scans (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT REFERENCES sessions(id),
        timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- Resultado
        decoded_text    TEXT,
        format          TEXT,
        read_success    INTEGER DEFAULT 1,
        source          TEXT DEFAULT 'camera',
        scan_duration_ms INTEGER,

        -- Captura
        image_raw_path  TEXT,
        frame_width     INTEGER,
        frame_height    INTEGER,
        device_label    TEXT,

        -- Binarização
        image_binary_path TEXT,
        threshold_value   INTEGER,
        threshold_method  TEXT,

        -- Marcadores (finder patterns)
        finder_patterns TEXT,
        finder_score    REAL,

        -- Perspectiva
        homography_matrix TEXT,
        rotation_angle    REAL,

        -- Matriz binária
        matrix_data    TEXT,
        matrix_width   INTEGER,
        matrix_height  INTEGER,
        qr_version     INTEGER,

        -- Correção de erros / máscara
        mask_pattern        INTEGER,
        ec_level            TEXT,
        ec_codewords_total  INTEGER,
        ec_errors_detected  INTEGER,
        ec_errors_corrected INTEGER,

        -- Metadados
        raw_result TEXT,
        notes      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scans_timestamp ON scans(timestamp);
    CREATE INDEX IF NOT EXISTS idx_scans_format    ON scans(format);
    CREATE INDEX IF NOT EXISTS idx_scans_session   ON scans(session_id);
    CREATE INDEX IF NOT EXISTS idx_scans_success   ON scans(read_success);
    CREATE INDEX IF NOT EXISTS idx_scans_text      ON scans(decoded_text);
`);

module.exports = db;
