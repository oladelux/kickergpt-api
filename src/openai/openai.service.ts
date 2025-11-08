import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
  ChatCompletionMessage,
} from 'openai/resources/chat/completions';
import { AllConfigType } from '../config/config.type';
import { OpenAiConfig } from './config/openai-config.type';

export type OpenAiTextResponse = {
  text: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type OpenAiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

@Injectable()
export class OpenAiService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const config = this.configService.getOrThrow<OpenAiConfig>('openAi', {
      infer: true,
    });

    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model;
    this.temperature = config.temperature;
  }

  async generateText(
    messages: ChatCompletionMessageParam[],
  ): Promise<OpenAiTextResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      messages,
    });

    const text = completion.choices
      .map((choice) => {
        const content = choice.message.content;

        if (typeof content === 'string') {
          return content;
        }

        const structuredContent = content as unknown;

        if (Array.isArray(structuredContent)) {
          return structuredContent
            .map((part) => OpenAiService.extractStructuredText(part))
            .join('');
        }

        return '';
      })
      .join('\n')
      .trim();

    return {
      text,
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    };
  }

  async generateJson<T>(
    messages: ChatCompletionMessageParam[],
    schema: OpenAiJsonSchema,
    temperature?: number,
  ): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature:
        typeof temperature === 'number' ? temperature : this.temperature,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.name,
          schema: schema.schema,
          strict: schema.strict ?? true,
        },
      },
    });

    const jsonPayload = this.extractFirstContent(completion.choices);

    if (!jsonPayload) {
      throw new Error('OpenAI returned an empty JSON response.');
    }

    try {
      return JSON.parse(jsonPayload) as T;
    } catch (error) {
      throw new Error(
        `Failed to parse OpenAI JSON response. ${(error as Error).message}`,
      );
    }
  }

  private extractFirstContent(
    choices: Array<{ message: ChatCompletionMessage }>,
  ): string | undefined {
    const content = choices[0]?.message?.content;

    if (typeof content === 'string') {
      return content.trim();
    }

    return undefined;
  }

  private static extractStructuredText(part: unknown): string {
    if (
      part &&
      typeof part === 'object' &&
      'type' in part &&
      (part as { type?: unknown }).type === 'text' &&
      'text' in part
    ) {
      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    }

    return '';
  }
}
