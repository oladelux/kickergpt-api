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

  async userSignUp(
    mailData: MailData<{ hash: string; countryCode?: string | null }>,
  ): Promise<void> {
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

    const appUrl = this.configService.getOrThrow('app.frontendDomain', {
      infer: true,
    });
    const unsubscribeUrl = `${appUrl}/unsubscribe`;

    // Check if user is non-Nigerian (countryCode is not 'NG' or is null)
    const isNonNigerian =
      !mailData.data.countryCode ||
      mailData.data.countryCode.toUpperCase() !== 'NG';

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
        showPromoOffer: isNonNigerian,
        appUrl,
        unsubscribeUrl,
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

  async sendStrategiesFeatureEmail(params: {
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
      'strategies-feature-announcement.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      "We're thrilled to announce a game-changing feature that will revolutionize how you find and analyze football matches! 🚀",
      '',
      '🎯 Introducing Strategies: Your Personal Match-Finding Assistant',
      '',
      'Are you tired of manually sifting through hundreds of fixtures to find matches that meet your specific criteria? Strategies lets you build custom filters that automatically identify matches based on team performance, form, injuries, and historical data!',
      '',
      '✨ What Makes Strategies Powerful?',
      'Create intelligent filters using a combination of conditions:',
      '- Team Form: Analyze home/away performance patterns',
      '- Goals Patterns: Find high-scoring or defensive matches',
      '- Head-to-Head: Historical matchup analysis',
      '- Injuries: Factor in player availability',
      '- BTTS & Clean Sheets: Predict scoring patterns',
      '- Win Rates: Target consistent performers',
      '',
      '🎨 How It Works',
      '1. Create Your Strategy - Name it and define your criteria',
      '2. Add Conditions - Combine up to 10 different metrics',
      '3. Find Matches - Boot Room Bot scans all fixtures instantly',
      '4. Get Results - See only matches that meet ALL your criteria',
      '',
      '💡 Example Strategies You Can Create',
      '🏠 "Best Home Team" - Strong home form vs weak away teams',
      '⚽ "Over 1.5 Goals" - Consistent goal-scoring from both teams',
      '🛡️ "Defensive Battle" - Low-scoring, tight matches',
      '🔥 "Form Reversal" - Home advantage with contrasting momentum',
      '',
      '👑 PRO Feature',
      'Strategies is exclusively available to PRO users. Upgrade to unlock unlimited custom strategies with advanced filtering capabilities.',
      '',
      '📖 Want to Learn More?',
      'Check out our comprehensive guide:',
      'https://help.kickergpt.com/en/articles/13248747-introducing-strategies-your-personal-match-finding-assistant',
      '',
      '🚀 Ready to Create Your First Strategy?',
      `Visit: ${appUrl}/strategies`,
      '',
      "Whether you're looking for high-scoring home favorites, BTTS opportunities, or defensive masterclasses, Strategies gives you the power to filter through the noise and focus on what matters most to you.",
      '',
      'Happy strategizing! ⚽🎯',
      '',
      'The KickerGPT Team',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject:
        '🎯 Introducing Strategies: Your Personal Match-Finding Assistant',
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
    plan?: string;
    countryCode?: string | null;
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

    const plan = params.plan || 'PRO';
    const isNigerian = params.countryCode?.toUpperCase() === 'NG';

    // Determine plan details
    let planName: string;
    let planDuration: string;
    let promptsDescription: string;
    let features: string[];

    switch (plan) {
      case 'THREE_DAY_PASS':
        planName = '3-Day Pass';
        planDuration = 'for 3 days';
        promptsDescription = isNigerian
          ? 'Unlimited AI prompts for 3 days'
          : 'Unlimited prompts for 3 days';
        features = [
          'Unlimited AI prompts for 3 days',
          'Ad-free experience',
          'Priority chat throughput',
          'Email support from the team',
        ];
        break;
      case 'SEVEN_DAY_PASS':
        planName = '7-Day Pass';
        planDuration = 'for 7 days';
        promptsDescription = isNigerian
          ? 'Unlimited AI prompts for 7 days'
          : 'Unlimited prompts for 7 days';
        features = [
          'Unlimited AI prompts for 7 days',
          'Ad-free experience',
          'Priority chat throughput',
          'Email support from the team',
        ];
        break;
      case 'MONTHLY_UNLIMITED':
        planName = 'Monthly Unlimited';
        planDuration = 'per month';
        promptsDescription = isNigerian
          ? 'Unlimited AI prompts each month'
          : 'Unlimited prompts each month';
        features = [
          'Unlimited AI prompts each month',
          'AI-powered match predictions',
          'Ad-free experience',
          'Priority chat throughput',
          'Email support from the team',
          'Strategy analysis feature',
        ];
        break;
      case 'PRO':
      default:
        planName = 'PRO';
        planDuration = 'per month';
        promptsDescription = isNigerian
          ? 'Unlimited prompts'
          : '100 Prompts Per Month';
        features = [
          'Unlimited Predictions',
          isNigerian ? 'Unlimited prompts' : '100 Prompts Per Month',
          'Exclusive Features',
          'Priority Support',
        ];
        break;
    }

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'pro-welcome.hbs',
    );

    const subject = `Welcome to KickerGPT ${planName}! 🎉`;

    const textBody = [
      `Hey ${name},`,
      '',
      `Welcome to KickerGPT ${planName}! 🎉`,
      '',
      `Thank you for upgrading. You now have access to the full power of KickerGPT ${planDuration}. Here's what you can do:`,
      '',
      `⭐ ${planName} Benefits`,
      '',
      ...features.map((feature) => `✅ ${feature}`),
      '',
      '💡 Getting Started',
      '1. Check Your Predictions',
      "Visit the Predictions section to see today's high-confidence match predictions.",
      '',
      '2. Ask Deep Questions',
      `Use your ${promptsDescription.toLowerCase()} to dive deep into match analysis, team strategies, and player insights.`,
      '',
      '3. Explore All Features',
      'Take advantage of extended match access, detailed analysis, and all premium features.',
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
      subject,
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        planName,
        planDuration,
        promptsDescription,
        features,
        appUrl,
        unsubscribeUrl,
      },
    });
  }

  async sendWelcomeEmail(params: {
    to: string;
    name?: string;
    countryCode?: string | null;
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

    // Check if user is non-Nigerian (countryCode is not 'NG' or is null)
    const showPromoOffer =
      !params.countryCode || params.countryCode.toUpperCase() !== 'NG';

    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', {
        infer: true,
      }),
      'src',
      'mail',
      'mail-templates',
      'welcome.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      'Welcome to KickerGPT! 🎉',
      '',
      "Thank you for joining our community of football enthusiasts. Your email has been verified, and you're all set to start exploring the world of football intelligence.",
      '',
      "🚀 What's Next?",
      '',
      '✅ Explore Predictions - Get access to high-confidence match predictions',
      '✅ Ask Questions - Use AI to get insights about matches, teams, and players',
      '✅ Discover Features - Unlock the full power of football intelligence',
      '',
      `Open KickerGPT: ${appUrl}`,
      ...(showPromoOffer
        ? [
            '',
            '🎉 Welcome Bonus!',
            '',
            'KickerGPT PRO is now just $7/month',
            '',
            'Special Offer for New Customers',
            '50% OFF',
            'First month only - Use code: KICKERGPTNEWYEARDEAL',
            "That's just $3.50 for your first month!",
            '',
            `Upgrade to PRO: ${appUrl}/plans?promo=KICKERGPTNEWYEARDEAL`,
          ]
        : []),
      '',
      "We're excited to have you on board and can't wait to see how you use KickerGPT to enhance your football experience.",
      '',
      "Questions? Just reply to this email - we're here to help!",
      '',
      'The KickerGPT Team',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: 'Welcome to KickerGPT! 🎉',
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        appUrl,
        unsubscribeUrl,
        showPromoOffer,
      },
    });
  }

  async sendProPriceChangeEmail(params: {
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
      'pro-price-change-promo.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      '🎉 Big News! KickerGPT PRO is Now Just $7/month',
      '',
      "We're excited to share some fantastic news! We've made KickerGPT PRO more accessible than ever. Starting today, PRO is just $7/month - making premium football intelligence available to more fans worldwide.",
      '',
      '⏰ Limited Time Offer: 50% OFF - Next 12 Hours Only!',
      '',
      'Use Promo Code: KICKERGPTNEWYEARDEAL',
      '',
      "That's just $3.50/month for the first month!",
      '',
      '⭐ Why Upgrade to PRO?',
      '',
      '🎯 Unlimited Match Predictions',
      'Get access to all high-confidence match predictions with no limits. While free users see only 5 predictions, PRO members unlock the complete database of expert-analyzed matches.',
      '',
      '💬 100 AI Prompts Per Month',
      'Ask unlimited questions about matches, teams, players, tactics, and more. Get deep insights with 10x more prompts than the free plan.',
      '',
      '🎨 Exclusive Strategies Feature',
      'Create custom match-finding strategies with intelligent filters. Build your own criteria using team form, goals patterns, head-to-head records, injuries, and more.',
      '',
      '🚀 Priority Support & Early Access',
      'Get priority customer support and be the first to access new features. PRO members are at the forefront of innovation.',
      '',
      'What You Get:',
      '✅ Unlimited predictions - Never miss a high-confidence match',
      '✅ 100 monthly AI prompts - Get answers to all your football questions',
      '✅ Custom strategies - Build intelligent match filters',
      '✅ Extended match access - View detailed analysis and insights',
      '✅ Priority support - Get help when you need it',
      '✅ Early access - Try new features before everyone else',
      '',
      `Upgrade to PRO now: https://kickergpt.com/plans`,
      '',
      "Offer expires in 12 hours. Don't miss this opportunity!",
      '',
      "Questions? Just reply to this email - we're here to help!",
      '',
      'The KickerGPT Team',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: '🎉 Special Offer: KickerGPT PRO Now Just $7 - 50% Off Today!',
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

  async sendStrategyMatchesEmail(params: {
    to: string;
    name?: string;
    strategyName: string;
    matches: Array<{
      homeTeam: string;
      awayTeam: string;
      league: string;
      date: string;
      time: string;
      venue?: string;
    }>;
    appUrl?: string;
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (!this.isMailEnabled()) {
      return;
    }

    const name = params.name?.trim() || 'there';
    const matchCount = params.matches.length;
    const matchText = matchCount === 1 ? 'match' : 'matches';
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
      'strategy-matches.hbs',
    );

    const matchesList = params.matches
      .map(
        (m) =>
          `${m.homeTeam} vs ${m.awayTeam} - ${m.league} (${m.date} at ${m.time})${m.venue ? ` at ${m.venue}` : ''}`,
      )
      .join('\n');

    const textBody = [
      `Hey ${name},`,
      '',
      `Your strategy "${params.strategyName}" has found ${matchCount} matching ${matchText} for today!`,
      '',
      "Today's Matches:",
      matchesList,
      '',
      `View full analysis: ${appUrl}`,
      '',
      'Good luck with your matches today!',
      '',
      'The KickerGPT Team',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: `🎯 ${matchCount} ${matchText} found for "${params.strategyName}" - KickerGPT`,
      text: textBody,
      templatePath,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
      context: {
        name,
        strategyName: params.strategyName,
        matchCount,
        matchText,
        matches: params.matches,
        appUrl,
        unsubscribeUrl,
      },
    });
  }

  async sendPasswordResetSuccessEmail(params: {
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
      'password-reset-success.hbs',
    );

    const textBody = [
      `Hey ${name},`,
      '',
      'Great news! Your password has been successfully reset.',
      '',
      '✅ Password Reset Successful',
      'Your KickerGPT account password was changed successfully. All active sessions have been logged out for security purposes.',
      '',
      '🔒 Security Information',
      '- All active sessions have been terminated',
      "- You'll need to sign in again with your new password",
      "- If you didn't make this change, please contact us immediately",
      '',
      "💡 What's Next?",
      "You can now sign in to your account using your new password. Make sure to keep your password secure and don't share it with anyone.",
      '',
      `Sign in: ${appUrl}/sign-in`,
      '',
      "If you didn't request this password reset, please contact our support team immediately.",
      '',
      'The KickerGPT Team',
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: params.to,
      subject: '✅ Password Reset Successful - KickerGPT',
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
