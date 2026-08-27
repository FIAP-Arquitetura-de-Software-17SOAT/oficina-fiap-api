import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailSender } from './email-sender';
import { NodemailerEmailSender } from './nodemailer-email-sender';

@Module({
  imports: [ConfigModule],
  providers: [{ provide: EmailSender, useClass: NodemailerEmailSender }],
  exports: [EmailSender],
})
export class EmailModule {}
