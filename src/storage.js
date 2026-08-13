import{APP_VERSION,defaultData,normalizeData}from'./domain.js';
const PLAIN='BT_DATA',SECURE='BT_SECURE_V1',CORRUPT='BT_DATA_corrupt_backup_';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=u=>btoa(String.fromCharCode(...u)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

export function hasSecureStorage(){return !!localStorage.getItem(SECURE)}
export function loadPlainData(){
 const raw=localStorage.getItem(PLAIN);if(!raw)return normalizeData(defaultData);
 try{return normalizeData(JSON.parse(raw))}catch(e){try{localStorage.setItem(CORRUPT+Date.now(),raw)}catch{}return normalizeData(defaultData)}
}
export function savePlainData(data){try{localStorage.setItem(PLAIN,JSON.stringify(normalizeData(data)));return true}catch{return false}}
async function keyFromPin(pin,salt){const material=await crypto.subtle.importKey('raw',enc.encode(String(pin)),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export async function encryptPayload(data,pin){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await keyFromPin(pin,salt),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(normalizeData(data))));return{version:1,appVersion:APP_VERSION,salt:b64(salt),iv:b64(iv),cipher:b64(new Uint8Array(cipher))}}
export async function decryptPayload(payload,pin){const salt=unb64(payload.salt),iv=unb64(payload.iv),key=await keyFromPin(pin,salt),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,unb64(payload.cipher));return normalizeData(JSON.parse(dec.decode(plain)))}
export async function unlockSecure(pin){const raw=localStorage.getItem(SECURE);if(!raw)throw new Error('Kilitli veri bulunamadı');return decryptPayload(JSON.parse(raw),pin)}
export async function saveSecureData(data,pin){try{const payload=await encryptPayload(data,pin);localStorage.setItem(SECURE,JSON.stringify(payload));return true}catch{return false}}
export async function enableSecureStorage(data,pin){if(String(pin).length<4)throw new Error('PIN en az 4 hane olmalı');const ok=await saveSecureData(data,pin);if(!ok)throw new Error('Şifreli veri kaydedilemedi');localStorage.removeItem(PLAIN);return true}
export async function disableSecureStorage(data){const ok=savePlainData(data);if(!ok)throw new Error('Veri kaydedilemedi');localStorage.removeItem(SECURE);return true}
export async function exportBackup(data){const payload={format:'bt-backup',schemaVersion:2,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),payload:normalizeData(data)};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download=`BT-yedek-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
export function parseBackup(text){const x=JSON.parse(text);if(x?.format==='bt-backup'&&x.payload)return normalizeData(x.payload);if(x&&typeof x==='object'&&(Array.isArray(x.tx)||Array.isArray(x.cats)))return normalizeData(x);throw new Error('Bu dosya geçerli bir BT yedeği değil')}
