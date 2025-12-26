import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { AllConfigType } from '../config/config.type';

interface QueuedEmail {
  resolve: () => void;
  reject: (error: Error) => void;
  mailOptions: nodemailer.SendMailOptions & {
    templatePath: string;
    context: Record<string, unknown>;
  };
  retryCount: number;
}

@Injectable()
export class MailerService {
  private readonly transporter?: nodemailer.Transporter;
  private readonly mailEnabled: boolean;
  private readonly logger = new Logger(MailerService.name);
  private readonly rateLimitEnabled: boolean;
  private readonly rateLimitPerSecond: number;
  private readonly minDelayMs: number;
  private lastSendTime: number = 0;
  private emailQueue: QueuedEmail[] = [];
  private isProcessingQueue: boolean = false;
  private readonly maxRetries: number = 3;
  private readonly baseRetryDelayMs: number = 1000;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    this.mailEnabled =
      this.configService.get('mail.enabled', { infer: true }) ?? true;
    this.rateLimitEnabled =
      this.configService.get('mail.rateLimitEnabled', { infer: true }) ?? true;
    this.rateLimitPerSecond =
      this.configService.get('mail.rateLimitPerSecond', { infer: true }) ?? 2;
    // Calculate minimum delay: 1000ms / rateLimitPerSecond, with 10% safety margin
    this.minDelayMs = Math.ceil((1000 / this.rateLimitPerSecond) * 1.1);

    if (this.mailEnabled) {
      this.transporter = nodemailer.createTransport({
        host: configService.get('mail.host', { infer: true }),
        port: configService.get('mail.port', { infer: true }),
        ignoreTLS: configService.get('mail.ignoreTLS', { infer: true }),
        secure: configService.get('mail.secure', { infer: true }),
        requireTLS: configService.get('mail.requireTLS', { infer: true }),
        auth: {
          user: configService.get('mail.user', { infer: true }),
          pass: configService.get('mail.password', { infer: true }),
        },
      });
    }
  }

  async sendMail({
    templatePath,
    context,
    ...mailOptions
  }: nodemailer.SendMailOptions & {
    templatePath: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    if (!this.mailEnabled) {
      this.logger.debug('Mail disabled; skipping sendMail');
      return;
    }

    if (!this.transporter) {
      this.logger.warn('Mailer transporter not initialized; skipping sendMail');
      return;
    }

    // If rate limiting is disabled, send immediately
    if (!this.rateLimitEnabled) {
      await this.executeSendMail(templatePath, context, mailOptions);
      return;
    }

    // Queue the email for rate-limited sending
    return new Promise<void>((resolve, reject) => {
      this.emailQueue.push({
        resolve,
        reject,
        mailOptions: { templatePath, context, ...mailOptions },
        retryCount: 0,
      });

      // Start processing queue if not already processing
      if (!this.isProcessingQueue) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.emailQueue.length > 0) {
      const queuedEmail = this.emailQueue.shift();
      if (!queuedEmail) {
        break;
      }

      try {
        // Enforce rate limit delay
        await this.enforceRateLimit();

        // Execute the email send
        await this.executeSendMail(
          queuedEmail.mailOptions.templatePath,
          queuedEmail.mailOptions.context,
          queuedEmail.mailOptions,
        );

        queuedEmail.resolve();
      } catch (error) {
        const isRateLimitError = this.isRateLimitError(error);

        if (isRateLimitError && queuedEmail.retryCount < this.maxRetries) {
          // Retry with exponential backoff
          queuedEmail.retryCount += 1;
          const retryDelay =
            this.baseRetryDelayMs * Math.pow(2, queuedEmail.retryCount - 1);

          this.logger.warn(
            `Rate limit error (450) encountered. Retrying in ${retryDelay}ms (attempt ${queuedEmail.retryCount}/${this.maxRetries})`,
          );

          // Wait before retrying
          await this.delay(retryDelay);

          // Re-queue for retry
          this.emailQueue.unshift(queuedEmail);
        } else {
          // Max retries exceeded or non-rate-limit error
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to send email after ${queuedEmail.retryCount} retries: ${errorMessage}`,
          );
          queuedEmail.reject(
            error instanceof Error ? error : new Error(errorMessage),
          );
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastSend = now - this.lastSendTime;

    if (timeSinceLastSend < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastSend;
      await this.delay(waitTime);
    }

    this.lastSendTime = Date.now();
  }

  private async executeSendMail(
    templatePath: string | undefined,
    context: Record<string, unknown> | undefined,
    mailOptions: nodemailer.SendMailOptions,
  ): Promise<void> {
    let html: string | undefined;
    if (templatePath) {
      const template = await fs.readFile(templatePath, 'utf-8');
      html = Handlebars.compile(template, {
        strict: true,
      })(context || {});
    }

    await this.transporter!.sendMail({
      ...mailOptions,
      from: mailOptions.from
        ? mailOptions.from
        : `"${this.configService.get('mail.defaultName', {
            infer: true,
          })}" <${this.configService.get('mail.defaultEmail', {
            infer: true,
          })}>`,
      html: mailOptions.html ? mailOptions.html : html,
    });
  }

  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'responseCode' in error) {
      return error.responseCode === 450;
    }
    if (error instanceof Error) {
      return (
        error.message.includes('450') ||
        error.message.includes('Too many requests') ||
        error.message.includes('rate limit')
      );
    }
    return false;
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
