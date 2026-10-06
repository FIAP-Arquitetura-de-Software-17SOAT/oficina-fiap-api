/** Conteúdo de um e-mail; o destinatário é decidido por quem envia. */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}
