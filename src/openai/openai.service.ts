import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
  ChatCompletionMessage,
  ChatCompletionTool,
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

export type OpenAiToolDefinition = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
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
      .map((choice) =>
        OpenAiService.normalizeMessageContent(choice.message.content),
      )
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

  async generateTextWithTools(
    messages: ChatCompletionMessageParam[],
    tools: OpenAiToolDefinition[],
    options?: { maxToolIterations?: number; temperature?: number },
  ): Promise<OpenAiTextResponse> {
    if (!tools.length) {
      return this.generateText(messages);
    }

    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    const toolDefinitions: ChatCompletionTool[] = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        strict: tool.strict ?? false,
      },
    }));

    const conversation: ChatCompletionMessageParam[] = [...messages];
    const maxIterations = options?.maxToolIterations ?? 8;
    const temperature =
      typeof options?.temperature === 'number'
        ? options.temperature
        : this.temperature;

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature,
        messages: conversation,
        tools: toolDefinitions,
        tool_choice: 'auto',
      });

      promptTokens += completion.usage?.prompt_tokens ?? 0;
      completionTokens += completion.usage?.completion_tokens ?? 0;
      totalTokens += completion.usage?.total_tokens ?? 0;

      const choice = completion.choices[0];

      if (!choice) {
        throw new Error('OpenAI did not return any choices.');
      }

      const assistantMessage = choice.message;
      const assistantParam: ChatCompletionMessageParam = {
        role: 'assistant',
        content: assistantMessage.content ?? '',
      };

      if (assistantMessage.tool_calls?.length) {
        (
          assistantParam as ChatCompletionMessageParam & {
            tool_calls?: typeof assistantMessage.tool_calls;
          }
        ).tool_calls = assistantMessage.tool_calls;
      }

      conversation.push(assistantParam);

      if (assistantMessage.tool_calls?.length) {
        for (const toolCall of assistantMessage.tool_calls) {
          const tool = toolMap.get(toolCall.function.name);
          const args = this.parseToolArguments(toolCall.function.arguments);
          let payload: unknown;

          this.logger.log(`Tool call requested: ${toolCall.function.name}`);

          if (!tool) {
            payload = {
              error: `Tool ${toolCall.function.name} is not registered on the server.`,
            };
          } else {
            try {
              payload = await tool.handler(args);
              this.logger.log(`Tool ${tool.name} completed successfully.`);
            } catch (error) {
              payload = {
                error: `Tool ${tool.name} failed: ${OpenAiService.normalizeError(error)}`,
              };
              this.logger.error(
                `Tool ${tool.name} execution threw an error: ${OpenAiService.normalizeError(error)}`,
              );
            }
          }

          conversation.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: OpenAiService.serializeToolPayload(payload),
          });
        }

        continue;
      }

      const text = OpenAiService.normalizeMessageContent(
        assistantMessage.content,
      );

      if (!text) {
        throw new Error('OpenAI returned an empty message.');
      }

      return {
        text,
        model: completion.model,
        promptTokens,
        completionTokens,
        totalTokens,
      };
    }

    throw new Error(
      'OpenAI exhausted the allowed tool iterations without producing a final response.',
    );
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

  private parseToolArguments(raw: string | null | undefined) {
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      this.logger.warn(
        `Unable to parse tool arguments: ${(error as Error).message}. Payload: ${raw}`,
      );
      return {};
    }
  }

  private static normalizeMessageContent(content: unknown): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => OpenAiService.extractStructuredText(part))
        .join('')
        .trim();
    }

    return '';
  }

  private static serializeToolPayload(payload: unknown): string {
    if (payload == null) {
      return '';
    }

    if (typeof payload === 'string') {
      return payload;
    }

    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  private static normalizeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return typeof error === 'string' ? error : JSON.stringify(error);
  }
}
