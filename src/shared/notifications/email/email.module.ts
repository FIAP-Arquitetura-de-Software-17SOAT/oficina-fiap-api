import { Module } from '@nestjs/common';
import { EmailSender } from './email-sender';
import { NodemailerEmailSender } from './nodemailer-email-sender';

@Module({
  providers: [{ provide: EmailSender, useClass: NodemailerEmailSender }],
  exports: [EmailSender],
})
export class EmailModule {}
