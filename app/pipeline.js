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

    // ── Pré-processamento para smart scanner ──────────────────────────────

    /** Blur Gaussiano 3×3 — suaviza ruído de sensor */
    _gaussianBlur(src) {
        const dst = this._cloneCanvas(src);
        const ctx = dst.getContext('2d');
        const img = ctx.getImageData(0, 0, dst.width, dst.height);
        const d = img.data, W = dst.width, H = dst.height;
        const tmp = new Uint8ClampedArray(d);
        for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
                let s  = tmp[((y-1)*W+(x-1))*4]     + tmp[((y-1)*W+x)*4]*2 + tmp[((y-1)*W+(x+1))*4];
                    s += tmp[(y*W+(x-1))*4]*2 + tmp[(y*W+x)*4]*4 + tmp[(y*W+(x+1))*4]*2;
                    s += tmp[((y+1)*W+(x-1))*4]     + tmp[((y+1)*W+x)*4]*2 + tmp[((y+1)*W+(x+1))*4];
                const pi = (y*W+x)*4;
                d[pi] = d[pi+1] = d[pi+2] = s >> 4;
            }
        }
        ctx.putImageData(img, 0, 0);
        return dst;
    }

    /** Unsharp mask 3×3 — aumenta nitidez das bordas */
    _sharpen(src) {
        const dst = this._cloneCanvas(src);
        const ctx = dst.getContext('2d');
        const img = ctx.getImageData(0, 0, dst.width, dst.height);
        const d = img.data, W = dst.width, H = dst.height;
        const tmp = new Uint8ClampedArray(d);
        for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
                const c   = tmp[(y*W+x)*4];
                const lap = tmp[((y-1)*W+x)*4] + tmp[((y+1)*W+x)*4]
                          + tmp[(y*W+(x-1))*4] + tmp[(y*W+(x+1))*4];
                const pi = (y*W+x)*4;
                d[pi] = d[pi+1] = d[pi+2] = Math.max(0, Math.min(255, c*5 - lap));
            }
        }
        ctx.putImageData(img, 0, 0);
        return dst;
    }

    /** Auto-contraste — estica histograma para [0, 255] */
    _autoContrast(src) {
        const dst = this._cloneCanvas(src);
        const ctx = dst.getContext('2d');
        const img = ctx.getImageData(0, 0, dst.width, dst.height);
        const d = img.data;
        let mn = 255, mx = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] < mn) mn = d[i];
            if (d[i] > mx) mx = d[i];
        }
        if (mx - mn < 10) return dst;
        const range = mx - mn;
        for (let i = 0; i < d.length; i += 4) {
            const v = ((d[i] - mn) / range * 255 + 0.5) | 0;
            d[i] = d[i+1] = d[i+2] = v;
        }
        ctx.putImageData(img, 0, 0);
        return dst;
    }

    /** CLAHE — equalização de histograma adaptativa por tiles */
    _clahe(src, tileSize = 64, clipLimit = 3.0) {
        const dst = this._cloneCanvas(src);
        const ctx = dst.getContext('2d');
        const img = ctx.getImageData(0, 0, dst.width, dst.height);
        const d = img.data, W = dst.width, H = dst.height;

        for (let y0 = 0; y0 < H; y0 += tileSize) {
            for (let x0 = 0; x0 < W; x0 += tileSize) {
                const x1 = Math.min(x0 + tileSize, W);
                const y1 = Math.min(y0 + tileSize, H);
                const n  = (x1 - x0) * (y1 - y0);
                if (n < 4) continue;

                const hist = new Int32Array(256);
                for (let y = y0; y < y1; y++)
                    for (let x = x0; x < x1; x++)
                        hist[d[(y*W+x)*4]]++;

                const limit = Math.max(1, (clipLimit * n / 256 + 0.5) | 0);
                let excess = 0;
                for (let i = 0; i < 256; i++) {
                    if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
                }
                const add = (excess / 256) | 0;
                for (let i = 0; i < 256; i++) hist[i] += add;

                const lut = new Uint8Array(256);
                let cdf = 0, cdfMin = 0, found = false;
                for (let i = 0; i < 256; i++) {
                    if (!found && hist[i] > 0) { cdfMin = hist[i]; found = true; }
                    cdf += hist[i];
                    lut[i] = n > cdfMin ? ((cdf - cdfMin) / (n - cdfMin) * 255 + 0.5) | 0 : 0;
                }

                for (let y = y0; y < y1; y++) {
                    for (let x = x0; x < x1; x++) {
                        const pi = (y*W+x)*4;
                        const v  = lut[d[pi]];
                        d[pi] = d[pi+1] = d[pi+2] = v;
                    }
                }
            }
        }
        ctx.putImageData(img, 0, 0);
        return dst;
    }

    /** Threshold adaptativo via integral image — binarização local */
    _adaptiveThreshold(src, blockSize = 15, C = 4) {
        const dst = this._cloneCanvas(src);
        const ctx = dst.getContext('2d');
        const img = ctx.getImageData(0, 0, dst.width, dst.height);
        const d = img.data, W = dst.width, H = dst.height;
        const half = blockSize >> 1;

        // Integral image (Int32: max = W*H*255 ≈ 78M, cabe em 32 bits)
        const ii = new Int32Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                ii[(y+1)*(W+1)+(x+1)] = d[(y*W+x)*4]
                    + ii[y*(W+1)+(x+1)] + ii[(y+1)*(W+1)+x] - ii[y*(W+1)+x];
            }
        }

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const x0 = Math.max(0, x - half), y0 = Math.max(0, y - half);
                const x1 = Math.min(W-1, x + half), y1 = Math.min(H-1, y + half);
                const cnt  = (x1-x0+1) * (y1-y0+1);
                const sum  = ii[(y1+1)*(W+1)+(x1+1)] - ii[y0*(W+1)+(x1+1)]
                           - ii[(y1+1)*(W+1)+x0]      + ii[y0*(W+1)+x0];
                const mean = (sum / cnt + 0.5) | 0;
                const pi   = (y*W+x)*4;
                const v    = d[pi] < mean - C ? 0 : 255;
                d[pi] = d[pi+1] = d[pi+2] = v;
            }
        }
        ctx.putImageData(img, 0, 0);
        return dst;
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
