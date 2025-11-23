import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { MailData } from './interfaces/mail-data.interface';

import { MaybeType } from '../utils/types/maybe.type';
import { MailerService } from '../mailer/mailer.service';
import path from 'path';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async userSignUp(mailData: MailData<{ hash: string }>): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }
    const i18n = I18nContext.current();
    let emailConfirmTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;

    if (i18n) {
      [emailConfirmTitle, text1, text2, text3] = await Promise.all([
        i18n.t('common.confirmEmail'),
        i18n.t('confirm-email.text1'),
        i18n.t('confirm-email.text2'),
        i18n.t('confirm-email.text3'),
      ]);
    }

    const url = new URL(
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/confirm-email',
    );
    url.searchParams.set('hash', mailData.data.hash);

    await this.mailerService.sendMail({
      to: mailData.to,
      subject: emailConfirmTitle,
      text: `${url.toString()} ${emailConfirmTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'activation.hbs',
      ),
      context: {
        title: emailConfirmTitle,
        url: url.toString(),
        actionTitle: emailConfirmTitle,
        app_name: this.configService.get('app.name', { infer: true }),
        text1,
        text2,
        text3,
      },
    });
  }

  async forgotPassword(
    mailData: MailData<{ hash: string; tokenExpires: number }>,
  ): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }
    const i18n = I18nContext.current();
    let resetPasswordTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;
    let text4: MaybeType<string>;

    if (i18n) {
      [resetPasswordTitle, text1, text2, text3, text4] = await Promise.all([
        i18n.t('common.resetPassword'),
        i18n.t('reset-password.text1'),
        i18n.t('reset-password.text2'),
        i18n.t('reset-password.text3'),
        i18n.t('reset-password.text4'),
      ]);
    }

    const url = new URL(
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/password-change',
    );
    url.searchParams.set('hash', mailData.data.hash);
    url.searchParams.set('expires', mailData.data.tokenExpires.toString());

    await this.mailerService.sendMail({
      to: mailData.to,
      subject: resetPasswordTitle,
      text: `${url.toString()} ${resetPasswordTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'reset-password.hbs',
      ),
      context: {
        title: resetPasswordTitle,
        url: url.toString(),
        actionTitle: resetPasswordTitle,
        app_name: this.configService.get('app.name', {
          infer: true,
        }),
        text1,
        text2,
        text3,
        text4,
      },
    });
  }

  async confirmNewEmail(mailData: MailData<{ hash: string }>): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }
    const i18n = I18nContext.current();
    let emailConfirmTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;

    if (i18n) {
      [emailConfirmTitle, text1, text2, text3] = await Promise.all([
        i18n.t('common.confirmEmail'),
        i18n.t('confirm-new-email.text1'),
        i18n.t('confirm-new-email.text2'),
        i18n.t('confirm-new-email.text3'),
      ]);
    }

    const url = new URL(
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/confirm-new-email',
    );
    url.searchParams.set('hash', mailData.data.hash);

    await this.mailerService.sendMail({
      to: mailData.to,
      subject: emailConfirmTitle,
      text: `${url.toString()} ${emailConfirmTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'confirm-new-email.hbs',
      ),
      context: {
        title: emailConfirmTitle,
        url: url.toString(),
        actionTitle: emailConfirmTitle,
        app_name: this.configService.get('app.name', { infer: true }),
        text1,
        text2,
        text3,
      },
    });
  }

  async sendFirst300Email(params: {
    to: string;
    name?: string;
    surveyLink?: string;
    promoCode?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const surveyLink = params.surveyLink || 'https://www.kickergpt.com/survey';
    const promoCode = params.promoCode || 'FIRST300';
    const unsubscribeUrl =
      params.unsubscribeUrl ||
      `${this.configService.getOrThrow('app.backendDomain', {
        infer: true,
      })}/unsubscribe`;

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'first-300.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      "You're among the first 300 people using KickerGPT, and I wanted to reach out personally.",
      "Here's the problem we're solving:",
      "Everyone knows Man City should beat Ipswich. But sometimes they don't. And when that happens, it's not because you picked wrong—it's because there were factors you couldn't see.",
      'Maybe City played 3 matches in 8 days. Maybe the referee has a pattern with big teams. Maybe Ipswich performs completely differently on Saturdays. Maybe the weather mirrors a past upset.',
      "These patterns exist in the data. Most people just don't look.",
      "That's what KickerGPT does.",
      'We analyze 14 dimensions per match:',
      'Head-to-head patterns',
      'Day-of-week performance',
      'Weather impact',
      'Referee history with each team',
      'Injury impact vs squad depth',
      'Rest days and fatigue',
      'Home/away splits',
      'Momentum and streaks',
      'Goal patterns (clean sheets, BTTS)',
      'Upset history when teams are underdogs',
      'And more...',
      "It's not about predicting scores. It's about surfacing the insights you'd never think to look for.",
      'We need your help.',
      "We're still early and want to make KickerGPT genuinely useful for you. Would you take 2 minutes to share your feedback?",
      surveyLink,
      "And here's a thank you:",
      'As one of our first 300, you get 90% off Pro (100 prompts/month instead of 10).',
      `Use code: ${promoCode} at checkout.`,
      'Thanks for being here from the start.',
      '',
      'KickerGPT Team',
      "P.S. — If KickerGPT has helped you spot something you wouldn't have seen otherwise, I'd love to hear about it. Just reply to this email.",
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: "You're one of our first 300 users. Here's what that means.",
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        surveyLink,
        promoCode,
        unsubscribeUrl,
      },
    });
  }

  private isMailEnabled(): boolean {
    return this.configService.get('mail.enabled', { infer: true }) ?? true;
  }
}
