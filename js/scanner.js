"use strict";

/*
=========================================================
SCANNER.JS (Baseado no seu arquivo original)
=========================================================
*/

let scannerVideo = null;
let scannerCanvas = null;
let scannerStream = null;
let scannerTrack = null;
let barcodeDetector = null;

let scannerRodando = false;
let scannerGeneration = 0;
let scannerFrame = null;

let ultimoCodigo = "";
let ultimoTempo = 0;

const SCANNER_CONFIG = {
    formatos: ["ean_13", "ean_8", "code_128"],
    repetirApos: 1500,
    timeout: 60000,
    largura: 1920,
    altura: 1080,
    fps: 30,
    debug: false
};

function scannerLog() {}
function scannerErro() {}

let fallbackPromise = null;
function loadFallback() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!fallbackPromise) fallbackPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'js/vendor/zxing-0.21.3.min.js';
        script.onload = () => window.ZXing ? resolve(window.ZXing) : reject(new Error('Leitor indisponível'));
        script.onerror = () => { script.remove(); fallbackPromise = null; reject(new Error('Falha ao carregar leitor')); };
        document.head.append(script);
    });
    return fallbackPromise;
}
function fallbackDetector(ZXing) {
    const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8]]]);
    const reader = new ZXing.MultiFormatReader();
    reader.setHints(hints);
    return { async detect(canvas) {
        const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
        const luminance = new Uint8ClampedArray(canvas.width * canvas.height);
        for (let i = 0; i < luminance.length; i++) luminance[i] = (rgba[i*4] + 2*rgba[i*4+1] + rgba[i*4+2]) / 4;
        try {
            const source = new ZXing.RGBLuminanceSource(luminance, canvas.width, canvas.height);
            const result = reader.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source)));
            return [{ rawValue: result.getText() }];
        } catch (error) {
            if (error instanceof ZXing.NotFoundException || error instanceof ZXing.ChecksumException || error instanceof ZXing.FormatException) return [];
            throw error;
        } finally { reader.reset(); }
    } };
}
function suportaScanner(){
    return !!navigator.mediaDevices?.getUserMedia;
}

async function iniciarScanner(videoId, callback, onTimeout = () => {}){
    if (!suportaScanner() || window.isSecureContext === false) {
        const error = new Error('Câmera requer HTTPS e navegador compatível.');
        error.name = 'SecurityError';
        throw error;
    }
    await pararScanner();
    const generation = scannerGeneration;
    try {
    let formats = SCANNER_CONFIG.formatos;
    let native = typeof window.BarcodeDetector === "function";
    if (native && window.BarcodeDetector.getSupportedFormats) {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        formats = formats.filter(format => supported.includes(format));
        native = formats.includes("ean_13") && formats.includes("ean_8");
    }
    const fallback = native ? null : await loadFallback();
    if (generation !== scannerGeneration) return;

    scannerVideo = document.getElementById(videoId);
    if(!scannerVideo){
        throw new Error("Elemento de vídeo não encontrado.");
    }

    if (!scannerCanvas) {
        scannerCanvas = document.createElement("canvas");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: SCANNER_CONFIG.largura },
            height: { ideal: SCANNER_CONFIG.altura },
            frameRate: { ideal: SCANNER_CONFIG.fps }
        }
    });

    if (generation !== scannerGeneration) { stream.getTracks().forEach(t => t.stop()); return; }
    scannerStream = stream;
    scannerVideo.muted = true;
    scannerVideo.setAttribute?.("playsinline", "");
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();
    if (generation !== scannerGeneration) return;

    scannerTrack = scannerStream.getVideoTracks()[0];
    barcodeDetector = native ? new window.BarcodeDetector({ formats }) : fallbackDetector(fallback);

    scannerRodando = true;
    scannerLog("Scanner iniciado com recorte de mira central.");

    if (generation !== scannerGeneration) return;
    iniciarLoop(callback, generation, onTimeout);
    } catch (error) { if (generation === scannerGeneration) await pararScanner(); throw error; }
}

function iniciarLoop(callback, generation, onTimeout){
    const inicio = Date.now();
    const ctx = scannerCanvas.getContext("2d", { willReadFrequently: true });

    async function loop(){
        if(!scannerRodando || generation !== scannerGeneration){
            return;
        }

        try{
            if(scannerVideo.readyState >= 2 && scannerVideo.videoWidth > 0){
                const vWidth = scannerVideo.videoWidth;
                const vHeight = scannerVideo.videoHeight;

                const cropWidth = Math.floor(vWidth * 0.90);
                const cropHeight = Math.floor(vHeight * 0.55);
                const cropX = (vWidth - cropWidth) / 2;
                const cropY = (vHeight - cropHeight) / 2;

                scannerCanvas.width = cropWidth;
                scannerCanvas.height = cropHeight;

                ctx.drawImage(
                    scannerVideo,
                    cropX, cropY, cropWidth, cropHeight,
                    0, 0, cropWidth, cropHeight
                );

                const resultados = await barcodeDetector.detect(scannerCanvas);

                if (generation !== scannerGeneration) return;
                if(resultados.length){
                    for (const res of resultados) {
                        if (res.rawValue) {
                            processarCodigo(res.rawValue, callback);
                            if (generation !== scannerGeneration) return;
                        }
                    }
                }
            }
        }
        catch(e){
            scannerErro(e);
        }

        if (!scannerRodando || generation !== scannerGeneration) return;
        if(Date.now() - inicio > SCANNER_CONFIG.timeout){
            scannerLog("Timeout.");
            pararScanner();
            onTimeout();
            return;
        }

        scannerFrame = requestAnimationFrame(loop);
    }

    loop();
}

let ultimoTempoLeituraGlobal = 0;
const INTERVALO_ENTRE_LEITURAS_MS = 1200;

function processarCodigo(codigo, callback) {
    const agora = Date.now();

    if (agora - ultimoTempoLeituraGlobal < INTERVALO_ENTRE_LEITURAS_MS) {
        return;
    }

    const digitos = (codigo || "").replace(/\D/g,"");

    if (!validarEAN13(digitos) && digitos.length !== 8) {
        return;
    }

    ultimoCodigo = digitos;
    ultimoTempo = agora;
    ultimoTempoLeituraGlobal = agora;

    scannerLog("Código válido lido dentro da mira:", digitos);

    callback(digitos);
}

function validarEAN13(codigo) {
    if (!codigo) return false;
    codigo = codigo.replace(/\D/g, "");
    
    if (codigo.length !== 13) return false;

    let soma = 0;
    for (let i = 0; i < 12; i++) {
        const n = parseInt(codigo[i], 10);
        soma += (i % 2 === 0) ? n : n * 3;
    }

    const digito = (10 - (soma % 10)) % 10;
    return digito === parseInt(codigo[12], 10);
}

async function pararScanner(){
    scannerGeneration++;
    scannerRodando = false;

    if(scannerFrame){
        cancelAnimationFrame(scannerFrame);
        scannerFrame = null;
    }

    if(scannerTrack){
        scannerTrack.stop();
        scannerTrack = null;
    }

    if(scannerStream){
        scannerStream.getTracks().forEach(t=>t.stop());
        scannerStream = null;
    }

    if(scannerVideo){
        scannerVideo.pause();
        scannerVideo.srcObject = null;
    }

    barcodeDetector = null;
    ultimoCodigo = "";
    ultimoTempo = 0;

    scannerLog("Scanner encerrado.");
}

window.iniciarScanner = iniciarScanner;
window.pararScanner = pararScanner;
