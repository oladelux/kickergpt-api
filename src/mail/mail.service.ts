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

  async sendUpgradeQuestionEmail(params: {
    to: string;
    name?: string;
    senderName?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const senderName = params.senderName?.trim() || 'KickerGPT';
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
      'upgrade-question.hbs',
    );

    const textBody = [
      'Hey,',
      '',
      "I noticed you signed up for KickerGPT but haven't upgraded to Pro.",
      '',
      "I'm trying to make the product better, and I'd love to understand:",
      '1. What did you hope KickerGPT would do for you?',
      '2. What stopped you from upgrading?',
      '3. What would make it worth paying for?',
      '',
      'Just hit reply — I read every response.',
      '',
      `Thanks,\n${senderName}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: 'Quick question about KickerGPT',
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        senderName,
        unsubscribeUrl,
      },
    });
  }

  async sendProductUpdatesEmail(params: {
    to: string;
    name?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const unsubscribeUrl =
      params.unsubscribeUrl ||
      `${this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      })}/unsubscribe`;

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'product-updates.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      "We've been working hard to make KickerGPT better for you. Here's what's new:",
      '',
      '🎨 Enhanced User Interface',
      "We've redesigned key parts of the app to make your experience smoother and more intuitive.",
      '',
      '📅 Extended Match Access',
      'You can now access and analyze matches up to 3 days ahead, giving you more time to plan your strategy.',
      '',
      '💳 Flexible Prompt Top-ups',
      'Exhausted your monthly prompts? You can now top up anytime—even without a PRO subscription.',
      '',
      '🚀 More Accurate Analysis Coming',
      "We're adding more data context to deliver even deeper and more accurate match analysis. Stay tuned!",
      '',
      '⭐ Exclusive PRO Features Coming Soon',
      'Basic Plan: 10 free prompts per month',
      'PRO Plan: 100 prompts per month + exclusive features',
      '',
      'Follow us on X (Twitter) for more updates: @kickergpt',
      'https://twitter.com/kickergpt',
      '',
      'Thanks for being part of the KickerGPT community!',
      '',
      'The KickerGPT Team',
      '',
      "You're receiving this email because you requested access to KickerGPT.",
      "Need help? Reply to this email and we'll get back ASAP.",
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: "What's New at KickerGPT - Product Updates",
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        unsubscribeUrl,
      },
    });
  }

  async sendMilestoneCelebrationEmail(params: {
    to: string;
    name?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const unsubscribeUrl =
      params.unsubscribeUrl ||
      `${this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      })}/unsubscribe`;

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'milestone-celebration.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      'We have some exciting news to share with you!',
      '',
      '🎉 2000+ Users!',
      "Over the weekend, we hit an incredible milestone - 2000+ users are now using KickerGPT! This wouldn't have been possible without amazing users like you.",
      '',
      '🎁 5 Free Prompts - On Us!',
      "To celebrate this milestone, we're giving 5 free prompts to every user. They've already been added to your account - no action needed! Just log in and start using them.",
      '',
      '📱 Google Play Store Launch',
      "We're thrilled to announce that KickerGPT is now available on the Google Play Store! Download the app and take your match analysis on the go.",
      '',
      '🎁 Surprise for Early Downloaders',
      "Be among the first 20 people to download from the Google Play Store and get a special surprise! Don't wait - download now and see what's waiting for you.",
      '',
      'Follow us on X (Twitter) for more updates: @kickergpt',
      'https://twitter.com/kickergpt',
      '',
      'Thanks for being part of the KickerGPT community!',
      '',
      'The KickerGPT Team',
      '',
      "You're receiving this email because you requested access to KickerGPT.",
      "Need help? Reply to this email and we'll get back ASAP.",
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: '🎉 Celebrating 2000+ Users - Your 5 Free Prompts Are Here!',
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        unsubscribeUrl,
      },
    });
  }

  async sendExhaustedPromptsEmail(params: {
    to: string;
    name?: string;
    upgradeUrl?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const upgradeUrl = params.upgradeUrl || 'https://www.kickergpt.com/plans';
    const unsubscribeUrl =
      params.unsubscribeUrl ||
      `${this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      })}/unsubscribe`;

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'prompt-exhausted-discount.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      "You've used all 10 of your free prompts this month.",
      '',
      "That puts you in the top 20% of KickerGPT users. Clearly you're finding the analysis useful.",
      '',
      'I want to make upgrading easy for you:',
      '',
      '90% off your first month of Pro',
      '',
      'Just ₦1,000 (normally ₦10,000)',
      '',
      'Offer is just available for the next 24hrs',
      '',
      'What you get:',
      '- 100 prompts per month (10x more)',
      '- Never hit the limit again',
      '',
      `Upgrade Now: ${upgradeUrl}`,
      '',
      "Or just reply and tell me what's holding you back. I read every response.",
      '',
      'Cheers,',
      'KickerGPT',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: "You've used all your prompts - here's 90% off",
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        upgradeUrl,
        unsubscribeUrl,
      },
    });
  }

  async sendPredictionsFeatureEmail(params: {
    to: string;
    name?: string;
    appUrl?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const appUrl =
      params.appUrl ||
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      });
    const unsubscribeUrl =
      params.unsubscribeUrl ||
      `${this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      })}/unsubscribe`;

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'predictions-feature-announcement.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      "We're excited to introduce a brand new feature that takes match analysis to the next level!",
      '',
      '🎯 Daily Match Predictions',
      'Get high-confidence match outcome predictions powered by advanced algorithms analyzing bookmaker odds, team form, head-to-head history, injuries, news sentiment, and more.',
      '',
      '✨ How It Works',
      'Our AI analyzes multiple factors for each match:',
      '- Bookmaker odds and implied probabilities',
      '- Recent team form and momentum',
      '- Head-to-head historical performance',
      '- Key player injuries and availability',
      '- News sentiment and team morale',
      '- Home advantage factors',
      '',
      'Only matches with 90%+ confidence are included in predictions.',
      '',
      '📊 Free vs PRO Access',
      'Free users: Get up to 5 high-confidence predictions per day',
      'PRO users: Get all predictions with unlimited access',
      '',
      '⚡ Updated Daily',
      "Predictions are generated fresh every day at midnight, so you always have the latest insights for today's matches.",
      '',
      `View Predictions: ${appUrl}`,
      '',
      'Thanks for being part of the KickerGPT community!',
      '',
      'The KickerGPT Team',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: '🎯 New Feature: Daily Match Predictions Now Available',
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        appUrl,
        unsubscribeUrl,
      },
    });
  }

  async sendProWelcomeEmail(params: {
    to: string;
    name?: string;
    appUrl?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const appUrl =
      params.appUrl ||
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      });
    const unsubscribeUrl =
      params.unsubscribeUrl ||
      `${this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      })}/unsubscribe`;

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'pro-welcome.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      'Welcome to KickerGPT PRO! 🎉',
      '',
      "Thank you for upgrading. You now have access to the full power of KickerGPT. Here's what you can do:",
      '',
      '⭐ PRO Benefits',
      '',
      '🎯 Unlimited Predictions',
      'Get access to all high-confidence match predictions - no limits! While free users see 5 predictions, you get everything.',
      '',
      '💬 100 Prompts Per Month',
      'Ask unlimited questions about matches, teams, players, and more. Get deep insights with 10x more prompts than the free plan.',
      '',
      '🚀 Exclusive Features',
      'Access to all premium features and priority support. More exclusive features coming soon!',
      '',
      '💡 Getting Started',
      '1. Check Your Predictions',
      "Visit the Predictions section to see today's high-confidence match predictions.",
      '',
      '2. Ask Deep Questions',
      'Use your 100 monthly prompts to dive deep into match analysis, team strategies, and player insights.',
      '',
      '3. Explore All Features',
      'Take advantage of extended match access, detailed analysis, and all PRO-exclusive features.',
      '',
      `Open KickerGPT: ${appUrl}`,
      '',
      "If you have any questions or need help, just reply to this email. We're here to help!",
      '',
      'The KickerGPT Team',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: 'Welcome to KickerGPT PRO! 🎉',
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        appUrl,
        unsubscribeUrl,
      },
    });
  }

  private isMailEnabled(): boolean {
    return this.configService.get('mail.enabled', { infer: true }) ?? true;
  }
}
