import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = process.env.PINYIN_AUDIO_OUTPUT_ROOT
  ? path.resolve(ROOT, process.env.PINYIN_AUDIO_OUTPUT_ROOT)
  : path.join(ROOT, 'assets', 'audio', 'pinyin');
const FORCE = process.argv.includes('--force');
const CONCURRENCY = 1;
const MAX_ATTEMPTS = 4;
const locale = 'zh-CN';
const TTS_ENDPOINT = process.env.PINYIN_TTS_ENDPOINT || 'https://tiengtrungcoca.vercel.app/api/tts';
const PINYIN_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const CATALOG_ONLY = process.argv.includes('--catalog-only');
const FINALIZE_ONLY = process.argv.includes('--finalize-only');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const PROBE_ONLY = process.argv.includes('--probe');
const DIRECT_ONLY = process.env.PINYIN_TTS_DIRECT_ONLY === '1';
const MANDARIN_INPUT_RE = /^[\u3400-\u9fff。！？、，]+$/u;

const items = [
  ...[
    ['b','波','bō'],['p','坡','pō'],['m','摸','mō'],['f','发','fā'],['d','搭','dā'],['t','他','tā'],['n','你','nǐ'],['l','拉','lā'],
    ['g','哥','gē'],['k','科','kē'],['h','喝','hē'],['j','鸡','jī'],['q','七','qī'],['x','西','xī'],['zh','知','zhī'],['ch','吃','chī'],
    ['sh','诗','shī'],['r','日','rì'],['z','字','zì'],['c','词','cí'],['s','四','sì']
  ].map(([label, input, pinyin]) => ({ id:`initial-${label}`, category:'initials', label, input, pinyin, file:`initials/${label}.wav` })),
  ...[
    ['a','阿','ā'],['o','喔','ō'],['e','鹅','é'],['i','一','yī'],['u','乌','wū'],['u-umlaut','鱼','yú'],
    ['ai','爱','ài'],['ei','黑','hēi'],['ao','奥','ào'],['ou','欧','ōu'],['an','安','ān'],['en','恩','ēn'],
    ['ang','昂','áng'],['eng','冷','lěng'],['ong','东','dōng'],['ia','家','jiā'],['ie','谢','xiè'],['ua','瓜','guā'],['uo','我','wǒ'],['ue','月','yuè']
  ].map(([label, input, pinyin]) => ({ id:`final-${label}`, category:'finals', label:label === 'u-umlaut' ? 'ü' : label === 'ue' ? 'üe' : label, input, pinyin, file:`finals/${label}.wav` })),
  ...[
    ['tone-ma-1','妈','mā','tone1'],['tone-ma-2','麻','má','tone2'],['tone-ma-3','马','mǎ','tone3'],['tone-ma-4','骂','mà','tone4'],['tone-ma-neutral','吗','ma','neutral']
  ].map(([id, input, pinyin, tone]) => ({ id, category:'tones', label:pinyin, input, pinyin, tone, file:`tones/${id.replace('tone-','')}.wav` })),
  ...[
    ['syllable-ni','你','nǐ'],['syllable-hao','好','hǎo'],['syllable-zhong','中','zhōng'],['example-kou','口','kǒu'],['example-lu','路','lù'],
    ['example-liu','流','liú'],['example-gui','贵','guì'],['example-nv','女','nǚ'],['example-lv','绿','lǜ']
  ].map(([id, input, pinyin]) => ({ id, category:id.startsWith('syllable') ? 'syllables' : 'examples', label:pinyin, input, pinyin, file:`${id.startsWith('syllable') ? 'syllables' : 'examples'}/${id}.wav` })),
  ...[
    ['comparison-bpmf','波。坡。摸。发。','bō · pō · mō · fā',['initial-b','initial-p','initial-m','initial-f']],
    ['comparison-dtnlzcs','搭。他。你。拉。字。词。四。','dā · tā · nǐ · lā · zì · cí · sì',['initial-d','initial-t','initial-n','initial-l','initial-z','initial-c','initial-s']],
    ['comparison-jqx','鸡。七。西。','jī · qī · xī',['initial-j','initial-q','initial-x']],
    ['comparison-zhchshr','知。吃。诗。日。','zhī · chī · shī · rì',['initial-zh','initial-ch','initial-sh','initial-r']],
    ['comparison-zcs','字。词。四。','zì · cí · sì',['initial-z','initial-c','initial-s']],
    ['comparison-u-umlaut','路。绿。','lù · lǜ',['example-lu','example-lv']],
    ['comparison-tones-ma','妈。麻。马。骂。吗。','mā · má · mǎ · mà · ma',['tone-ma-1','tone-ma-2','tone-ma-3','tone-ma-4','tone-ma-neutral']],
    ['comparison-finals-basic','阿。喔。鹅。一。乌。鱼。','a · o · e · i · u · ü',['final-a','final-o','final-e','final-i','final-u','final-u-umlaut']],
    ['comparison-finals-compound','爱。黑。奥。欧。','ai · ei · ao · ou',['final-ai','final-ei','final-ao','final-ou']],
    ['comparison-finals-nasal','安。恩。昂。冷。东。','an · en · ang · eng · ong',['final-an','final-en','final-ang','final-eng','final-ong']]
  ].map(([id, input, pinyin, members]) => ({ id, category:'comparisons', label:pinyin, input, pinyin, members, file:`comparisons/${id.replace('comparison-','')}.wav` }))
];

async function loadEnv(file) {
  let source = '';
  try { source = await fs.readFile(file, 'utf8'); } catch { return; }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value.replace(/\\n/g, '\n');
  }
}

async function requestTts(item) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response;
  try {
    response = await fetch(TTS_ENDPOINT, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ text:item.input, mode:'vocabulary' }), signal:controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `TTS HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

async function requestGeminiDirect(item) {
  if (!process.env.GEMINI_API_KEY) return null;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45_000);
  try{
    const prompt=[
      'Speak as a warm native mainland Mandarin teacher helping a complete beginner.',
      'Read only the Chinese characters after TEXT. Do not read these instructions, punctuation names, Latin letters, or translations.',
      'Use standard Putonghua, natural tone contours, consistent volume, and a pace about 20 percent slower than everyday conversation.',
      'Pause clearly at Chinese full stops. Do not exaggerate or lengthen syllables unnaturally.',
      `TEXT: ${item.input}`
    ].join('\n');
    const model=process.env.GEMINI_TTS_MODEL||PINYIN_TTS_MODEL;
    const useInteractions=model.startsWith('gemini-3.1-');
    const endpoint=useInteractions
      ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const headers={'x-goog-api-key':process.env.GEMINI_API_KEY,'Content-Type':'application/json'};
    if(useInteractions)headers['Api-Revision']='2026-05-20';
    const body=useInteractions
      ? {model,input:prompt,response_format:{type:'audio'},generation_config:{speech_config:[{voice:process.env.GEMINI_TTS_VOICE||'Orus'}]}}
      : {contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:process.env.GEMINI_TTS_VOICE||'Orus'}}}}};
    const response=await fetch(endpoint,{method:'POST',headers,signal:controller.signal,body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(payload?.error?.message||`Gemini HTTP ${response.status}`);
      error.status=response.status;error.code=`gemini_http_${response.status}`;
      const retryDelay=payload?.error?.details?.find(detail=>String(detail?.['@type']||'').includes('RetryInfo'))?.retryDelay;
      if(typeof retryDelay==='string' && /^\d+(?:\.\d+)?s$/.test(retryDelay))error.retryDelayMs=Math.ceil(Number.parseFloat(retryDelay)*1000);
      throw error;
    }
    const encoded=useInteractions
      ? payload?.output_audio?.data
      : payload?.candidates?.[0]?.content?.parts?.find(part=>part?.inlineData?.data)?.inlineData?.data;
    if(!encoded)throw new Error('Gemini returned no audio');
    const pcm=Buffer.from(encoded,'base64');
    const samples=new Int16Array(Math.floor(pcm.length/2));
    for(let index=0;index<samples.length;index+=1)samples[index]=pcm.readInt16LE(index*2);
    return {buffer:encodeWav(samples,24000,1),source:'gemini-direct'};
  }finally{clearTimeout(timeout);}
}

function parseWav(buffer) {
  if (buffer.subarray(0,4).toString('ascii') !== 'RIFF' || buffer.subarray(8,12).toString('ascii') !== 'WAVE') throw new Error('Invalid WAV header');
  let offset = 12, fmt = null, data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') fmt = { format:buffer.readUInt16LE(start), channels:buffer.readUInt16LE(start+2), sampleRate:buffer.readUInt32LE(start+4), bits:buffer.readUInt16LE(start+14) };
    if (id === 'data') { data = buffer.subarray(start, Math.min(start + size, buffer.length)); break; }
    offset = start + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) throw new Error('Expected PCM 16-bit WAV');
  const samples = new Int16Array(data.length / 2);
  for (let i=0;i<samples.length;i+=1) samples[i] = data.readInt16LE(i*2);
  return { ...fmt, samples };
}

function encodeWav(samples, sampleRate, channels=1) {
  const dataSize = samples.length * 2;
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF',0); out.writeUInt32LE(36+dataSize,4); out.write('WAVE',8); out.write('fmt ',12); out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20); out.writeUInt16LE(channels,22); out.writeUInt32LE(sampleRate,24); out.writeUInt32LE(sampleRate*channels*2,28);
  out.writeUInt16LE(channels*2,32); out.writeUInt16LE(16,34); out.write('data',36); out.writeUInt32LE(dataSize,40);
  for (let i=0;i<samples.length;i+=1) out.writeInt16LE(samples[i],44+i*2);
  return out;
}

function prepareAudio(buffer) {
  const wav = parseWav(buffer);
  if (wav.channels !== 1 || wav.sampleRate !== 24000) throw new Error(`Expected 24kHz mono, got ${wav.sampleRate}Hz/${wav.channels}ch`);
  const threshold = 180;
  let first = 0, last = wav.samples.length - 1;
  while (first < last && Math.abs(wav.samples[first]) < threshold) first += 1;
  while (last > first && Math.abs(wav.samples[last]) < threshold) last -= 1;
  const pad = Math.round(wav.sampleRate * .12);
  first = Math.max(0, first - pad); last = Math.min(wav.samples.length - 1, last + pad);
  const trimmed = wav.samples.slice(first, last + 1);
  let sumSquares = 0, peak = 0;
  for (const sample of trimmed) { const abs=Math.abs(sample); peak=Math.max(peak,abs); sumSquares += sample*sample; }
  const rms = Math.sqrt(sumSquares / Math.max(1, trimmed.length));
  const targetRms = 32768 * (10 ** (-20/20));
  const gain = Math.min(targetRms / Math.max(1,rms), (32767*.94) / Math.max(1,peak));
  const normalized = new Int16Array(trimmed.length);
  for (let i=0;i<trimmed.length;i+=1) normalized[i] = Math.max(-32768, Math.min(32767, Math.round(trimmed[i]*gain)));
  return encodeWav(normalized, wav.sampleRate, wav.channels);
}

function estimatePitch(samples, sampleRate) {
  const frameSize = Math.round(sampleRate*.045), hop = Math.round(sampleRate*.015), minLag=Math.floor(sampleRate/380), maxLag=Math.ceil(sampleRate/75);
  const values=[];
  for (let start=0;start+frameSize<samples.length;start+=hop) {
    let energy=0; for(let i=0;i<frameSize;i+=1) energy += samples[start+i]*samples[start+i];
    if (Math.sqrt(energy/frameSize) < 450) continue;
    let bestLag=0,best=-Infinity;
    for(let lag=minLag;lag<=maxLag;lag+=1){ let corr=0,a=0,b=0; for(let i=0;i<frameSize-lag;i+=1){ const x=samples[start+i],y=samples[start+i+lag];corr+=x*y;a+=x*x;b+=y*y; } const score=corr/Math.sqrt(Math.max(1,a*b)); if(score>best){best=score;bestLag=lag;} }
    if(best>.3 && bestLag) values.push(sampleRate/bestLag);
  }
  return values;
}

function analyse(buffer, tone='') {
  const wav=parseWav(buffer); let sum=0,peak=0,clipped=0,silent=0;
  for(const sample of wav.samples){ const abs=Math.abs(sample);sum+=sample*sample;peak=Math.max(peak,abs);if(abs>=32760)clipped+=1;if(abs<180)silent+=1; }
  const rms=Math.sqrt(sum/Math.max(1,wav.samples.length));
  const metric={ duration:Number((wav.samples.length/wav.sampleRate).toFixed(3)),sampleRate:wav.sampleRate,channels:wav.channels,bitsPerSample:wav.bits,rmsDbfs:Number((20*Math.log10(Math.max(1,rms)/32768)).toFixed(2)),peakDbfs:Number((20*Math.log10(Math.max(1,peak)/32768)).toFixed(2)),clippingRatio:Number((clipped/wav.samples.length).toFixed(6)),silenceRatio:Number((silent/wav.samples.length).toFixed(4)) };
  const pitch=estimatePitch(wav.samples,wav.sampleRate);
  if(pitch.length>=6){ const part=Math.max(1,Math.floor(pitch.length*.3)); const avg=a=>a.reduce((x,y)=>x+y,0)/a.length; metric.pitchHz={ start:Number(avg(pitch.slice(0,part)).toFixed(1)),middle:Number(avg(pitch.slice(part,-part)).toFixed(1)),end:Number(avg(pitch.slice(-part)).toFixed(1)),frames:pitch.length }; }
  const issues=[];
  if(metric.sampleRate!==24000)issues.push('sample-rate');
  if(metric.channels!==1)issues.push('channels');
  if(metric.bitsPerSample!==16)issues.push('bit-depth');
  if(metric.duration<.28 || metric.duration>(tone ? 4.5 : 14))issues.push('duration');
  if(metric.rmsDbfs < -27 || metric.rmsDbfs > -14)issues.push('loudness');
  if(metric.clippingRatio>.0005)issues.push('clipping');
  if(metric.silenceRatio>.72)issues.push('silence');
  const p=metric.pitchHz;
  if(['tone2','tone3','tone4'].includes(tone) && !p)issues.push('pitch-track');
  if(p && tone==='tone2' && p.end < p.start*1.08)issues.push('tone-contour');
  if(p && tone==='tone4' && p.end > p.start*.92)issues.push('tone-contour');
  if(p && tone==='tone3' && p.middle > Math.min(p.start,p.end)*.98)issues.push('tone-contour');
  return { ...metric, issues };
}

async function validExisting(file) { try { const buffer=await fs.readFile(file); return parseWav(buffer).samples.length>0; } catch { return false; } }
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function listWavFiles(directory, relative = '') {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await listWavFiles(directory, child));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.wav')) files.push(child.replaceAll('\\', '/'));
  }
  return files;
}

async function verifyStaticLibrary() {
  const manifestPath = path.join(OUTPUT_ROOT, 'manifest.json');
  const catalogPath = path.join(OUTPUT_ROOT, 'source-catalog.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  const failures = [];
  const expectedById = new Map(items.map(item => [item.id, item]));
  const manifestItems = Array.isArray(manifest.items) ? manifest.items : [];
  const catalogItems = Array.isArray(catalog.items) ? catalog.items : [];
  const manifestById = new Map(manifestItems.map(item => [item.id, item]));
  const catalogById = new Map(catalogItems.map(item => [item.id, item]));

  if (manifest.lessonId !== 'hsk1-pinyin-intro') failures.push('manifest lessonId');
  if (manifest.locale !== locale || catalog.locale !== locale) failures.push('locale');
  if (manifestItems.length !== items.length || manifestById.size !== items.length) failures.push('manifest item count or duplicate id');
  if (catalogItems.length !== items.length || catalogById.size !== items.length) failures.push('catalog item count or duplicate id');

  for (const expected of items) {
    const entry = manifestById.get(expected.id);
    const source = catalogById.get(expected.id);
    if (!entry) { failures.push(`${expected.id}: missing manifest entry`); continue; }
    if (!source) failures.push(`${expected.id}: missing catalog entry`);
    if (!MANDARIN_INPUT_RE.test(expected.input) || !MANDARIN_INPUT_RE.test(entry.input || '') || !MANDARIN_INPUT_RE.test(source?.input || '')) failures.push(`${expected.id}: non-Mandarin TTS input`);
    if (entry.file !== expected.file || source?.file !== expected.file) failures.push(`${expected.id}: file mapping`);
    if (entry.path !== `assets/audio/pinyin/${expected.file}`) failures.push(`${expected.id}: public path`);
    if (entry.qcStatus !== 'automated-pass' || entry.qc?.automated !== true || entry.qc?.metrics?.issues?.length) failures.push(`${expected.id}: QC status`);
    if (!entry.provider || !entry.model || !entry.voice) failures.push(`${expected.id}: provenance`);
    try {
      const buffer = await fs.readFile(path.join(OUTPUT_ROOT, expected.file));
      const metrics = analyse(buffer, expected.tone);
      if (metrics.issues.length) failures.push(`${expected.id}: ${metrics.issues.join(', ')}`);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      if (sha256 !== entry.sha256) failures.push(`${expected.id}: sha256`);
    } catch (error) {
      failures.push(`${expected.id}: ${error.message}`);
    }
  }

  for (const entry of manifestItems) if (!expectedById.has(entry.id)) failures.push(`${entry.id}: unexpected manifest entry`);
  for (const entry of catalogItems) if (!expectedById.has(entry.id)) failures.push(`${entry.id}: unexpected catalog entry`);
  const actualFiles = (await listWavFiles(OUTPUT_ROOT)).sort();
  const expectedFiles = items.map(item => item.file).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) failures.push('WAV file set differs from catalog');

  if (failures.length) throw new Error(`Pinyin audio verification failed: ${failures.join('; ')}`);
  const categories = Object.fromEntries([...new Set(items.map(item => item.category))].map(category => [category, items.filter(item => item.category === category).length]));
  console.log(`[verify] total=${items.length} accepted=${items.length} hashes=${items.length} locale=${locale} categories=${JSON.stringify(categories)}`);
}

function splitBundle(buffer, expectedCount) {
  const wav = parseWav(buffer);
  const frameSize = Math.round(wav.sampleRate * .01);
  const frameRms = [];
  for (let start=0; start<wav.samples.length; start+=frameSize) {
    let sum=0, count=0;
    for (let i=start;i<Math.min(start+frameSize,wav.samples.length);i+=1) { sum += wav.samples[i]*wav.samples[i]; count+=1; }
    frameRms.push(Math.sqrt(sum/Math.max(1,count)));
  }
  const maxRms = Math.max(...frameRms);
  const activeThreshold = Math.max(160, maxRms*.035);
  let first=0,last=frameRms.length-1;
  while(first<last && frameRms[first]<activeThreshold)first+=1;
  while(last>first && frameRms[last]<activeThreshold)last-=1;
  const gapThreshold=Math.max(220,maxRms*.12), gaps=[];
  let index=first+10;
  while(index<last-10){
    if(frameRms[index]>=gapThreshold){index+=1;continue;}
    const start=index;
    while(index<last && frameRms[index]<gapThreshold)index+=1;
    const end=index-1;
    if(end-start>=5)gaps.push({start,end,length:end-start+1,center:Math.round((start+end)/2)});
  }
  const selected=gaps.sort((a,b)=>b.length-a.length).slice(0,expectedCount-1).sort((a,b)=>a.center-b.center);
  if(selected.length!==expectedCount-1)throw new Error(`Bundle split found ${selected.length+1}/${expectedCount} utterances`);
  const cuts=[first,...selected.map(gap=>gap.center),last+1];
  const segments=[];
  for(let i=0;i<expectedCount;i+=1){
    const start=Math.max(0,cuts[i]*frameSize);
    const end=Math.min(wav.samples.length,cuts[i+1]*frameSize);
    segments.push(encodeWav(wav.samples.slice(start,end),wav.sampleRate,wav.channels));
  }
  return segments;
}

async function requestAndDownload(item) {
  try {
    const direct=await requestGeminiDirect(item);
    if(direct)return direct;
  } catch (error) {
    if(DIRECT_ONLY)throw error;
    console.warn(`[direct fallback] ${item.id}: ${error.code||''} ${error.message}`);
  }
  if(DIRECT_ONLY)throw new Error('PINYIN_TTS_DIRECT_ONLY requires GEMINI_API_KEY');
  const result=await requestTts(item);
  const response=await fetch(result.audioUrl);
  if(!response.ok)throw new Error(`download HTTP ${response.status}`);
  return { buffer:Buffer.from(await response.arrayBuffer()), source:result.cached?'cache':'gemini' };
}

async function buildBundle(bundle,bundleIndex) {
  const complete = !FORCE && (await Promise.all(bundle.map(item=>validExisting(path.join(OUTPUT_ROOT,item.file))))).every(Boolean);
  if(complete){ console.log(`[bundle ${bundleIndex}] existing: ${bundle.map(item=>item.id).join(', ')}`); return; }
  const request={ id:`bundle-${bundleIndex}`, input:`${bundle.map(item=>item.input).join('。')}。` };
  let response,lastError;
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt+=1){
    try{ response=await requestAndDownload(request); break; }
    catch(error){
      lastError=error;
      console.error(`[bundle retry ${attempt}/${MAX_ATTEMPTS}] ${request.id}: ${error.code||''} ${error.message}`);
      if(attempt<MAX_ATTEMPTS){
        const retryDelay=error.status===429 ? Math.max(7_000,Number(error.retryDelayMs||0)+7_000) : 3_000*attempt;
        await sleep(retryDelay);
      }
    }
  }
  if(!response)throw lastError;
  const segments=splitBundle(response.buffer,bundle.length);
  for(let i=0;i<bundle.length;i+=1){
    const target=path.join(OUTPUT_ROOT,bundle[i].file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,prepareAudio(segments[i]));
  }
  console.log(`[bundle ${bundleIndex}] ${response.source}: ${bundle.map(item=>item.id).join(', ')}`);
  await sleep(7_000);
}

async function buildComparison(item,itemMap) {
  const chunks=[];
  for(const id of item.members){
    const member=itemMap.get(id); const wav=parseWav(await fs.readFile(path.join(OUTPUT_ROOT,member.file)));
    if(wav.sampleRate!==24000 || wav.channels!==1 || wav.bits!==16)throw new Error(`${item.id}: invalid member format ${id}`);
    chunks.push(wav.samples);
  }
  const sampleRate=24000,silence=new Int16Array(Math.round(sampleRate*.34));
  const total=chunks.reduce((sum,chunk)=>sum+chunk.length,0)+silence.length*Math.max(0,chunks.length-1);
  const joined=new Int16Array(total);let offset=0;
  chunks.forEach((chunk,index)=>{joined.set(chunk,offset);offset+=chunk.length;if(index<chunks.length-1){joined.set(silence,offset);offset+=silence.length;}});
  const target=path.join(OUTPUT_ROOT,item.file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,encodeWav(joined,sampleRate,1));
}

async function buildOne(item) {
  if (!MANDARIN_INPUT_RE.test(item.input)) throw new Error(`${item.id}: TTS input must contain Hanzi/punctuation only`);
  const target=path.join(OUTPUT_ROOT,item.file); await fs.mkdir(path.dirname(target),{recursive:true});
  if(!FORCE && await validExisting(target)){ const buffer=await fs.readFile(target); return { ...item, source:'existing', buffer }; }
  let lastError;
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt+=1){
    try{
      const result=await requestTts(item);
      const response=await fetch(result.audioUrl);
      if(!response.ok)throw new Error(`download HTTP ${response.status}`);
      const prepared=prepareAudio(Buffer.from(await response.arrayBuffer()));
      await fs.writeFile(target,prepared);
      return { ...item, source:result.cached?'cache':'gemini', buffer:prepared };
    }catch(error){
      lastError=error;
      console.error(`[retry ${attempt}/${MAX_ATTEMPTS}] ${item.id}: ${error.code||''} ${error.message}`);
      if(attempt<MAX_ATTEMPTS) await sleep(error.status===429 ? 45_000*attempt : 2_500*attempt);
    }
  }
  throw lastError;
}

async function main(){
  await loadEnv(path.join(ROOT,'.env.local'));
  if(VERIFY_ONLY){
    await verifyStaticLibrary();
    return;
  }
  await fs.mkdir(OUTPUT_ROOT,{recursive:true});
  if(PROBE_ONLY){
    const probe=await requestAndDownload({id:'probe-bpmf',input:'波。坡。摸。发。'});
    const segments=splitBundle(probe.buffer,4).map(prepareAudio);
    console.log(`[probe] source=${probe.source} segments=${segments.length} bytes=${segments.reduce((sum,segment)=>sum+segment.length,0)}`);
    return;
  }
  if(CATALOG_ONLY){
    await fs.writeFile(path.join(OUTPUT_ROOT,'source-catalog.json'),`${JSON.stringify({version:1,locale,items},null,2)}\n`,'utf8');
    console.log(`[catalog] items=${items.length}`);
    return;
  }
  const baseItems=items.filter(item=>item.category!=='comparisons');
  const groups=[];
  for(const category of ['initials','finals','tones','syllables','examples']){
    const categoryItems=baseItems.filter(item=>item.category===category);
    for(let index=0;index<categoryItems.length;index+=5)groups.push(categoryItems.slice(index,index+5));
  }
  if(!FINALIZE_ONLY){ for(let index=0;index<groups.length;index+=1)await buildBundle(groups[index],index+1); }
  else {
    const missing=[];
    for(const item of baseItems)if(!await validExisting(path.join(OUTPUT_ROOT,item.file)))missing.push(item.id);
    if(missing.length)throw new Error(`Missing base audio before finalize: ${missing.join(', ')}`);
  }
  for(const item of baseItems){
    const target=path.join(OUTPUT_ROOT,item.file);
    await fs.writeFile(target,prepareAudio(await fs.readFile(target)));
  }
  const rejectedBase=[];
  for(const item of baseItems){
    const target=path.join(OUTPUT_ROOT,item.file);
    const metrics=analyse(await fs.readFile(target),item.tone);
    if(metrics.issues.length){
      rejectedBase.push(`${item.id} (${metrics.issues.join(', ')}; pitch=${JSON.stringify(metrics.pitchHz||null)})`);
      await fs.rm(target,{force:true});
    }
  }
  if(rejectedBase.length)throw new Error(`Base audio rejected before comparison build: ${rejectedBase.join('; ')}`);
  const itemMap=new Map(items.map(item=>[item.id,item]));
  for(const comparison of items.filter(item=>item.category==='comparisons'))await buildComparison(comparison,itemMap);
  const results=[];
  for(const item of items){
    try{results.push({...item,source:'static-build',buffer:await fs.readFile(path.join(OUTPUT_ROOT,item.file))});}
    catch(error){results.push({...item,error:error.message});}
  }
  const manifestItems=[]; let failures=0;
  for(const result of results){
    if(result.error){ failures+=1; manifestItems.push({...result,qcStatus:'rejected-generation'});continue; }
    const metrics=analyse(result.buffer,result.tone); const sha256=crypto.createHash('sha256').update(result.buffer).digest('hex');
    const qcStatus=metrics.issues.length?'rejected-technical':'automated-pass';
    if(metrics.issues.length){ failures+=1; await fs.rm(path.join(OUTPUT_ROOT,result.file),{force:true}); }
    const { buffer,...clean }=result;
    manifestItems.push({...clean,path:`assets/audio/pinyin/${result.file}`,locale,provider:process.env.PINYIN_AUDIO_PROVIDER||'gemini',model:process.env.PINYIN_AUDIO_MODEL||PINYIN_TTS_MODEL,voice:process.env.PINYIN_AUDIO_VOICE||process.env.GEMINI_TTS_VOICE||'Orus',voiceVersion:process.env.TTS_VOICE_VERSION||'v1',qcStatus,qc:{automated:true,nativeReview:'pending',metrics},sha256});
  }
  const manifest={ version:1,lessonId:'hsk1-pinyin-intro',locale,generatedAt:new Date().toISOString(),qualityNotice:'Automated signal and tone-contour checks passed. Listening and native-expert review must be recorded separately before claiming pronunciation is fully verified.',review:{automated:'passed',userListening:'pending',nativeExpert:'pending'},items:manifestItems };
  await fs.writeFile(path.join(OUTPUT_ROOT,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
  console.log(`[done] total=${items.length} accepted=${items.length-failures} rejected=${failures}`);
  if(failures)process.exitCode=1;
}

main().catch(error=>{console.error(error);process.exitCode=1;});
