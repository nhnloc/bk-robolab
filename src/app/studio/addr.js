// Kiểm tra địa chỉ tuyệt đối S7-1200 phía UI (không thay engine — chỉ để báo sớm trong bảng tag).
import { t } from '../i18n.js';

const BIT = /^%([IQM])(\d+)\.([0-7])$/i;
const BYTE = /^%([IQM])B(\d+)$/i;
const WORD = /^%([IQM])W(\d+)$/i;
const DWORD = /^%([IQM])D(\d+)$/i;

const SIZE = { Bool: 'bit', Byte: 'byte', Char: 'byte', Word: 'word', Int: 'word', UInt: 'word', DWord: 'dword', DInt: 'dword', UDInt: 'dword', Real: 'dword', Time: 'dword' };

/** Trả về null nếu hợp lệ, hoặc thông báo lỗi. */
export function validateAddress(addr, type = 'Bool') {
  const a = String(addr || '').trim();
  if (!a) return t('addr.empty');
  const need = SIZE[type] || 'bit';
  const m = BIT.exec(a) || BYTE.exec(a) || WORD.exec(a) || DWORD.exec(a);
  if (!m) return t('addr.bad', { a });
  const has = BIT.test(a) ? 'bit' : BYTE.test(a) ? 'byte' : WORD.test(a) ? 'word' : 'dword';
  if (has !== need) return t('addr.size', { type, ex: { bit: '%I0.0', byte: '%MB0', word: '%MW0', dword: '%MD0' }[need] });
  const area = m[1].toUpperCase(), byte = +m[2];
  if (area === 'M' && byte > 8191) return t('addr.mMax');
  if ((area === 'I' || area === 'Q') && byte > 1023) return t('addr.ioMax');
  return null;
}

export const isAbsolute = (s) => /^%[IQM]/i.test(String(s || '').trim());
export const TAG_NAME_RE = /^[\p{L}_0-9][\p{L}\p{N}_ ]*$/u;
