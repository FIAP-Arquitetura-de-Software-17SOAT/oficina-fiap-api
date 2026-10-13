import { randomBytes } from 'k6/crypto';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

/** Sufixo único por VU/iteração/instante, para e-mails e códigos. */
export function uniq() {
  return `${__VU}-${__ITER}-${Date.now().toString(36)}-${randomInt(1e6).toString(36)}`;
}

export function uuid() {
  const bytes = new Uint8Array(randomBytes(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cpfDigit(digits) {
  const weightStart = digits.length + 1;
  const sum = digits.reduce((acc, d, i) => acc + d * (weightStart - i), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** CPF com dígitos verificadores válidos (a API valida). */
export function cpf() {
  let base;
  do {
    base = Array.from({ length: 9 }, () => randomInt(10));
  } while (base.every((d) => d === base[0]));
  const first = cpfDigit(base);
  const second = cpfDigit([...base, first]);
  return [...base, first, second].join('');
}

/** Placa Mercosul: ABC1D23. */
export function plate() {
  const letter = () => LETTERS[randomInt(26)];
  return `${letter()}${letter()}${letter()}${randomInt(10)}${letter()}${randomInt(10)}${randomInt(10)}`;
}

export function email(prefix = 'load') {
  return `${prefix}-${uniq()}@load.test`;
}

export function phone() {
  return `(11) 9${String(randomInt(1e4)).padStart(4, '0')}-${String(randomInt(1e4)).padStart(4, '0')}`;
}
