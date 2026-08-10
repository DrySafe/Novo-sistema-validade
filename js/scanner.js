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
    debug: true
};

function scannerLog(...msg){
    if(SCANNER_CONFIG.debug){
        console.log("[SCANNER]", ...msg);
    }
}

function scannerErro(...msg){
    console.error("[SCANNER]", ...msg);
}

function suportaScanner(){
    return (
        "BarcodeDetector" in window &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
    );
}

async function iniciarScanner(videoId, callback){
    // Se a API nativa não for suportada, ativa a flag no Chrome Mobile ou exibe o alerta
    if(!suportaScanner()){
        alert("O seu navegador precisa da API BarcodeDetector ativa. No Chrome, acesse chrome://flags e ative 'Experimental Web Platform features'.");
        throw new Error("Barcode Detection API não suportada neste navegador.");
    }

    await pararScanner();

    scannerVideo = document.getElementById(videoId);
    if(!scannerVideo){
        throw new Error("Elemento de vídeo não encontrado.");
    }

    if (!scannerCanvas) {
        scannerCanvas = document.createElement("canvas");
    }

    scannerStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: SCANNER_CONFIG.largura },
            height: { ideal: SCANNER_CONFIG.altura },
            frameRate: { ideal: SCANNER_CONFIG.fps }
        }
    });

    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();

    scannerTrack = scannerStream.getVideoTracks()[0];
    barcodeDetector = new BarcodeDetector({
        formats: SCANNER_CONFIG.formatos
    });

    scannerRodando = true;
    scannerLog("Scanner iniciado com recorte de mira central.");

    iniciarLoop(callback);
}

function iniciarLoop(callback){
    const inicio = Date.now();
    const ctx = scannerCanvas.getContext("2d", { willReadFrequently: true });

    async function loop(){
        if(!scannerRodando){
            return;
        }

        try{
            if(scannerVideo.readyState >= 2 && scannerVideo.videoWidth > 0){
                const vWidth = scannerVideo.videoWidth;
                const vHeight = scannerVideo.videoHeight;

                const cropWidth = vWidth * 0.70;
                const cropHeight = vHeight * 0.25;
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

                if(resultados.length){
                    for (const res of resultados) {
                        if (res.rawValue) {
                            processarCodigo(res.rawValue, callback);
                        }
                    }
                }
            }
        }
        catch(e){
            scannerErro(e);
        }

        if(Date.now() - inicio > SCANNER_CONFIG.timeout){
            scannerLog("Timeout.");
            pararScanner();
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