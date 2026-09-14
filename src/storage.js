import{APP_VERSION,defaultData,normalizeData}from'./domain.js';
import{CLIENT_KEY,normalizeClientData}from'./clients-domain.js';
const PLAIN='BT_DATA',SECURE='BT_SECURE_V1';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=u=>{let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let writeVersion=0;
function withLegacyClients(data){if(data.clientTracker)return data;const legacy=localStorage.getItem(CLIENT_KEY);return {...data,clientTracker:normalizeClientData(legacy?JSON.parse(legacy):null)}}
function removeMigratedLegacy(data){if(data.clientTracker){try{localStorage.removeItem(CLIENT_KEY)}catch{}}}
export function hasSecureStorage(){return !!localStorage.getItem(SECURE)}
export function loadPlainData(){
  const raw=localStorage.getItem(PLAIN);if(!raw)return withLegacyClients(normalizeData(defaultData));
  // Unreadable data must never be replaced with an automatically saved empty state.
  try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.tx))throw new Error();return withLegacyClients(normalizeData(parsed))}
  catch{throw new Error('Kayıtlı veri okunamadı. Veriler silinmedi; lütfen yedeğinizi kontrol edin.')}
}
export function savePlainData(data){++writeVersion;try{localStorage.setItem(PLAIN,JSON.stringify(normalizeData(data)));removeMigratedLegacy(data);return true}catch{return false}}
async function keyFromPin(pin,salt){const material=await crypto.subtle.importKey('raw',enc.encode(String(pin)),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export async function encryptPayload(data,pin){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await keyFromPin(pin,salt),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(normalizeData(data))));return{version:1,appVersion:APP_VERSION,salt:b64(salt),iv:b64(iv),cipher:b64(new Uint8Array(cipher))}}
export async function decryptPayload(payload,pin){const salt=unb64(payload.salt),iv=unb64(payload.iv),key=await keyFromPin(pin,salt),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,unb64(payload.cipher));return normalizeData(JSON.parse(dec.decode(plain)))}
export async function unlockSecure(pin){const raw=localStorage.getItem(SECURE);if(!raw)throw new Error('Kilitli veri bulunamadı');return withLegacyClients(await decryptPayload(JSON.parse(raw),pin))}
export async function saveSecureData(data,pin){const version=++writeVersion;try{const payload=await encryptPayload(data,pin);if(version!==writeVersion)return false;localStorage.setItem(SECURE,JSON.stringify(payload));removeMigratedLegacy(data);return true}catch{return false}}
export async function enableSecureStorage(data,pin){if(!/^\d{4,}$/.test(String(pin)))throw new Error('PIN en az 4 rakam olmalı');const ok=await saveSecureData(data,pin);if(!ok)throw new Error('Şifreli veri kaydedilemedi; tekrar deneyin.');localStorage.removeItem(PLAIN);return true}
export async function disableSecureStorage(data){const ok=savePlainData(data);if(!ok)throw new Error('Veri kaydedilemedi');localStorage.removeItem(SECURE);return true}
export async function exportBackup(data){const payload={format:'bt-backup',schemaVersion:2,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),payload:normalizeData(data)};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download=`BT-yedek-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
export function parseBackup(text,currentClients){const x=JSON.parse(text),raw=x?.format==='bt-backup'?x.payload:x;if(!raw||typeof raw!=='object'||!Array.isArray(raw.tx))throw new Error('Bu dosya geçerli bir BT yedeği değil');const data=normalizeData(raw);if(!data.clientTracker&&currentClients)data.clientTracker=currentClients;return data}
