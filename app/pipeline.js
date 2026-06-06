/**
 * QR/Barcode image processing pipeline.
 * Executa no browser após cada leitura bem-sucedida.
 *
 * Etapas:
 *   1. Conversão para escala de cinza (luminância)
 *   2. Binarização por threshold de Otsu
 *   3. Extração da matriz binária da região do código
 */
class QrPipeline {

    /**
     * Executa o pipeline sobre o canvas de scan.
     * @param {HTMLCanvasElement} canvas  canvas com o frame capturado
     * @param {Object}            result  Html5QrcodeResult
     * @returns {Object} dados do pipeline para envio à API
     */
    run(canvas, result) {
        if (!canvas || !canvas.width || !canvas.height) return {};

        const { width: fw, height: fh } = canvas;

        // 1 — Grayscale
        const grayCanvas = this._grayscale(canvas);
        const imageRaw   = grayCanvas.toDataURL('image/jpeg', 0.80);

        // 2 — Binarização (Otsu)
        const { canvas: binCanvas, threshold, method } = this._binarize(grayCanvas);
        const imageBinary = binCanvas.toDataURL('image/png');

        // 3 — Extração da matriz
        const bounds = result?.result?.bounds ?? null;
        const matrix = this._extractMatrix(binCanvas, bounds);

        return {
            frame_width:      fw,
            frame_height:     fh,
            image_raw:        imageRaw,
            image_binary:     imageBinary,
            threshold_value:  threshold,
            threshold_method: method,
            matrix_data:      matrix?.bits   ?? null,
            matrix_width:     matrix?.width  ?? null,
            matrix_height:    matrix?.height ?? null,
            qr_version:       matrix?.version ?? null,
        };
    }

    // ─── Privados ──────────────────────────────────────────────────────────

    /** Retorna novo canvas em escala de cinza */
    _grayscale(src) {
        const dst = this._cloneCanvas(src);
        const ctx = dst.getContext('2d');
        const img = ctx.getImageData(0, 0, dst.width, dst.height);
        const d   = img.data;
        for (let i = 0; i < d.length; i += 4) {
            // Coeficientes ITU-R BT.601 (percepção humana)
            const g = (0.299 * d[i]) + (0.587 * d[i+1]) + (0.114 * d[i+2]) | 0;
            d[i] = d[i+1] = d[i+2] = g;
        }
        ctx.putImageData(img, 0, 0);
        return dst;
    }

    /** Binariza usando threshold de Otsu; retorna canvas 1-bit (P/B) */
    _binarize(graySrc) {
        const dst = this._cloneCanvas(graySrc);
        const ctx = dst.getContext('2d');
        const img = ctx.getImageData(0, 0, dst.width, dst.height);
        const d   = img.data;

        // Histograma
        const hist  = new Uint32Array(256);
        for (let i = 0; i < d.length; i += 4) hist[d[i]]++;

        // Algoritmo de Otsu
        const total = dst.width * dst.height;
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * hist[i];

        let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (!wB) continue;
            const wF = total - wB;
            if (!wF) break;
            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const v  = wB * wF * (mB - mF) * (mB - mF);
            if (v > maxVar) { maxVar = v; threshold = t; }
        }

        // Aplica threshold
        for (let i = 0; i < d.length; i += 4) {
            const v = d[i] > threshold ? 255 : 0;
            d[i] = d[i+1] = d[i+2] = v;
            d[i+3] = 255;
        }
        ctx.putImageData(img, 0, 0);

        return { canvas: dst, threshold, method: 'otsu' };
    }

    /**
     * Extrai a matriz binária da região do código.
     * Usa bounds (se disponível) para recortar a área exata do QR.
     */
    _extractMatrix(binCanvas, bounds) {
        try {
            const W = binCanvas.width, H = binCanvas.height;

            // Recorte com margem de 10%
            let sx = 0, sy = 0, sw = W, sh = H;
            if (bounds && bounds.width > 20 && bounds.height > 20) {
                const pad = Math.min(bounds.width, bounds.height) * 0.08 | 0;
                sx = Math.max(0, (bounds.x | 0) - pad);
                sy = Math.max(0, (bounds.y | 0) - pad);
                sw = Math.min(W - sx, (bounds.width  | 0) + 2 * pad);
                sh = Math.min(H - sy, (bounds.height | 0) + 2 * pad);
            }

            // Canvas temporário com a região recortada
            const tmp = document.createElement('canvas');
            tmp.width  = sw;
            tmp.height = sh;
            const ctx  = tmp.getContext('2d');
            ctx.drawImage(binCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            // Estima tamanho de módulo
            const modSize = this._estimateModuleSize(ctx, sw, sh);
            if (!modSize || modSize < 2) return null;

            const cols = Math.round(sw / modSize);
            const rows = Math.round(sh / modSize);
            if (cols < 21 || rows < 21) return null;

            // Amostra centro de cada módulo
            const bits = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const px = Math.min(((c + 0.5) * modSize) | 0, sw - 1);
                    const py = Math.min(((r + 0.5) * modSize) | 0, sh - 1);
                    const px4 = ctx.getImageData(px, py, 1, 1).data;
                    bits.push(px4[0] < 128 ? '1' : '0');
                }
            }

            const version = ((cols - 17) / 4) | 0;
            return {
                bits:    bits.join(''),
                width:   cols,
                height:  rows,
                version: (version >= 1 && version <= 40) ? version : null,
            };
        } catch (_) {
            return null;
        }
    }

    /**
     * Estima o tamanho de um módulo (pixel) analisando runs de pixels
     * na linha central do canvas. Baseado no padrão do finder pattern.
     */
    _estimateModuleSize(ctx, w, h) {
        const cy   = (h / 2) | 0;
        const data = ctx.getImageData(0, cy, w, 1).data;

        const runs = [];
        let cur = data[0] < 128 ? 1 : 0, len = 0;
        for (let x = 0; x < w; x++) {
            const bit = data[x * 4] < 128 ? 1 : 0;
            if (bit === cur) { len++; }
            else { if (len > 0) runs.push(len); cur = bit; len = 1; }
        }
        if (len > 0) runs.push(len);
        if (runs.length < 5) return null;

        // Percentil 25 como proxy do menor módulo
        const sorted = [...runs].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length * 0.25)] || null;
    }

    _cloneCanvas(src) {
        const dst = document.createElement('canvas');
        dst.width  = src.width;
        dst.height = src.height;
        dst.getContext('2d').drawImage(src, 0, 0);
        return dst;
    }
}

window.QrPipeline = QrPipeline;
