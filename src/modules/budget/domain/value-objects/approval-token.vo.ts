import { createHash, randomBytes } from 'crypto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Prova de que a resposta ao orçamento veio de quem recebeu o email.
 *
 * São 256 bits aleatórios, que vão no link do email do orçamento. O banco
 * guarda só o SHA-256: quem lê a tabela não consegue montar um link, e quem
 * conhece só o id do orçamento também não. SHA-256 sem salt basta aqui porque
 * o token é aleatório e longo — não há dicionário para atacar, ao contrário de
 * senha.
 */
export class ApprovalToken {
  /** Quanto tempo o link do email vale depois do envio do orçamento. */
  static readonly TTL_MS = 7 * 24 * 60 * 60 * 1000;

  private constructor(readonly value: string) {}

  static issue(): ApprovalToken {
    return new ApprovalToken(randomBytes(32).toString('base64url'));
  }

  /** `null` para o que nem tem o formato de um token emitido. */
  static parse(raw: string): ApprovalToken | null {
    return TOKEN_PATTERN.test(raw) ? new ApprovalToken(raw) : null;
  }

  digest(): string {
    return createHash('sha256').update(this.value).digest('hex');
  }
}
