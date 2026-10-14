import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('falha de inicialização encerra a câmera e fechamento cancela aquisição pendente', async () => {
 let stops = 0, resolveStream;
 const track = { stop() { stops++; } };
 const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
 const video = { play: async () => {}, pause() {} };
 const context = { console: { log() {}, error() {} }, alert() {}, window: {}, document: { getElementById: () => video, createElement: () => ({}) }, navigator: { mediaDevices: { getUserMedia: async () => stream } }, BarcodeDetector: class { constructor() { throw new Error('Detector falhou'); } }, cancelAnimationFrame() {} };
 context.window.BarcodeDetector = context.BarcodeDetector;
 vm.createContext(context); vm.runInContext(fs.readFileSync(new URL('../js/scanner.js', import.meta.url), 'utf8'), context);
 await assert.rejects(context.window.iniciarScanner('video', () => {}), /Detector falhou/);
 assert.ok(stops > 0); assert.equal(video.srcObject, null);
 stops = 0;
 context.navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { resolveStream = resolve; });
 const starting = context.window.iniciarScanner('video', () => {});
 await new Promise(resolve => setImmediate(resolve));
 await context.window.pararScanner(); resolveStream(stream); await starting;
 assert.equal(stops, 1); assert.equal(video.srcObject, null);
});
