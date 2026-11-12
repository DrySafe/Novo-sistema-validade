import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import vm from 'node:vm';
import {setupScanner,scannerMessage} from '../js/scannerUI.js';

test('botão da câmera lê EAN, dispara busca e encerra; permissão negada permite digitação',async()=>{
 const dom=new JSDOM('<button id="btn-toggle-camera"></button><div id="camera-container" class="hidden"></div><p id="camera-status"></p><input id="entry-ean">');
 const d=dom.window.document;let callback,changes=0,stops=0;
 d.querySelector('input').addEventListener('change',()=>changes++);
 const scanner={iniciarScanner:async(_id,cb)=>{callback=cb;},pararScanner:()=>{stops++;}};
 const stop=setupScanner(d,scanner);
 d.querySelector('button').click();await new Promise(r=>setImmediate(r));
 assert.equal(d.querySelector('button').getAttribute('aria-expanded'),'true');
 callback('4006381333931');assert.equal(d.querySelector('input').value,'4006381333931');assert.equal(changes,1);assert.equal(stops,1);
 assert.equal(d.querySelector('#camera-container').classList.contains('hidden'),true);
 scanner.iniciarScanner=async()=>{throw {name:'NotAllowedError'};};
 d.querySelector('button').click();await new Promise(r=>setImmediate(r));
 assert.match(d.querySelector('#camera-status').textContent,/permissões/);assert.equal(d.querySelector('input').disabled,false);
 stop();dom.window.close();
});

test('fechar o leitor durante inicialização impede resultado tardio',async()=>{
 const dom=new JSDOM('<button id="btn-toggle-camera"></button><div id="camera-container"></div><p id="camera-status"></p><input id="entry-ean">');let done,callback;
 const stop=setupScanner(dom.window.document,{iniciarScanner:(_id,cb)=>{callback=cb;return new Promise(r=>done=r);},pararScanner:()=>{}});
 dom.window.document.querySelector('button').click();stop();done();callback('4006381333931');await new Promise(r=>setImmediate(r));
 assert.equal(dom.window.document.querySelector('input').value,'');dom.window.close();
});

test('leitor alternativo local reconhece EAN sem BarcodeDetector nativo',async()=>{
 const context={window:{},console:{log(){},error(){}},navigator:{mediaDevices:{getUserMedia(){}}}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(new URL('../js/vendor/zxing-0.21.3.min.js',import.meta.url),'utf8'),context);
 vm.runInContext(fs.readFileSync(new URL('../js/scanner.js',import.meta.url),'utf8'),context);
 // EAN-13 4006381333931: paridade LGLLGG e dígitos com checksum válido.
 const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
 const R=L.map(s=>[...s].map(c=>c==='0'?'1':'0').join(''));
 const code='4006381333931',parity='LGLLGG';let bars='101';
 for(let i=0;i<6;i++)bars+=(parity[i]==='L'?L:G)[+code[i+1]];
 bars+='01010';for(const c of code.slice(7))bars+=R[+c];bars+='101';
 const width=900,height=110,rgba=new Uint8ClampedArray(width*height*4);rgba.fill(255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(bars[Math.floor((x-90)/6)]==='1'){const i=(y*width+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=0;}
 const canvas={width,height,getContext:()=>({getImageData:()=>({data:rgba})})};
 const detector=context.fallbackDetector(context.ZXing);const results=await detector.detect(canvas);
 assert.equal(results[0].rawValue,code);
 assert.match(scannerMessage({name:'NotReadableError'}),/ocupada/);
});
