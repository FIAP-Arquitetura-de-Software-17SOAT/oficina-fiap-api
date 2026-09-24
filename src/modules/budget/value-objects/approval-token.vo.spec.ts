import { createHash } from 'crypto';
import { ApprovalToken } from './approval-token.vo';

describe('ApprovalToken', () => {
  it('emite 256 bits aleatórios em base64url, diferentes a cada emissão', () => {
    const a = ApprovalToken.issue();
    const b = ApprovalToken.issue();

    expect(a.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.value).not.toBe(b.value);
  });

  it('guarda só o SHA-256 do token', () => {
    const token = ApprovalToken.issue();

    expect(token.digest()).toBe(
      createHash('sha256').update(token.value).digest('hex'),
    );
  });

  it('reconhece um token no formato emitido', () => {
    const token = ApprovalToken.issue();

    expect(ApprovalToken.parse(token.value)?.digest()).toBe(token.digest());
  });

  it.each(['', 'curto', 'x'.repeat(43) + '!', 'a'.repeat(44)])(
    'recusa %p fora do formato, sem consultar nada',
    (raw) => {
      expect(ApprovalToken.parse(raw)).toBeNull();
    },
  );
});
