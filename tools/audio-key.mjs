import { createHash } from 'node:crypto';

export const AUDIO_KEY_VERSION = 'nfc-space-punctuation-voice-rate-v1';
export const DEFAULT_AUDIO_VOICE = 'zh-CN-XiaoxiaoNeural';
export const PROFILE_RATES = Object.freeze({
  vocabulary: '-18%',
  'writing-sentence': '-12%',
  'lesson-passage': '-8%'
});

const PUNCTUATION_RULES = Object.freeze([
  [/[，､﹐]/g, ','],
  [/[。｡]/g, '.'],
  [/[！﹗]/g, '!'],
  [/[？﹖]/g, '?'],
  [/[：﹕]/g, ':'],
  [/[；﹔]/g, ';'],
  [/[“”„‟«»「」『』]/g, '"'],
  [/[‘’‚‛]/g, "'"],
  [/[（]/g, '('],
  [/[）]/g, ')'],
  [/[【〔［]/g, '['],
  [/[】〕］]/g, ']'],
  [/[｛]/g, '{'],
  [/[｝]/g, '}'],
  [/[—–−﹣]/g, '-'],
  [/…+/g, '...']
]);

export function normalizeAudioText(value) {
  let text = String(value || '')
    .normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F\u00A0\u3000]/g, ' ');
  for (const [pattern, replacement] of PUNCTUATION_RULES) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*([,.;:!?()[\]{}"'])\s*/g, '$1')
    .trim();
}

export function audioKeyMaterial(text, voice = DEFAULT_AUDIO_VOICE, rate = '') {
  return [
    normalizeAudioText(text),
    String(voice || DEFAULT_AUDIO_VOICE).trim(),
    String(rate || '').trim()
  ].join('\u001f');
}

export function createAudioKey(text, voice = DEFAULT_AUDIO_VOICE, rate = '') {
  return createHash('sha256').update(audioKeyMaterial(text, voice, rate), 'utf8').digest('hex');
}

export function createIdShardKey(id) {
  return createHash('sha256').update(String(id || '').trim(), 'utf8').digest('hex');
}
