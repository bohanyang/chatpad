import { encode } from "gpt-token-utils";
import OpenAI from "openai";
import { db } from "../db";
import { config } from "./config";
import { ChatCompletionMessageParam } from "openai/resources"

function getClient(
  apiKey: string,
  apiType: string,
  apiAuth: string,
  basePath: string
) {
  return new OpenAI({
    apiKey: apiKey,
    baseURL: basePath === '' ? undefined : basePath,
    dangerouslyAllowBrowser: true,
  });
}

export async function createStreamChatCompletion(
  apiKey: string,
  messages: ChatCompletionMessageParam[],
  chatId: string,
  messageId: string
) {
  const settings = await db.settings.get("general");
  const model = settings?.openAiModel ?? config.defaultModel;
  const type = settings?.openAiApiType ?? config.defaultType;
  const auth = settings?.openAiApiAuth ?? config.defaultAuth;
  const base = settings?.openAiApiBase ?? config.defaultBase;
  const version = settings?.openAiApiVersion ?? config.defaultVersion;

  const client = getClient(apiKey, type, auth, base);
  return client.beta.chat.completions.stream(
    {
      model,
      messages,
    },
    {
      headers: {
        "Content-Type": "application/json",
        ...(type === "custom" && auth === "api-key" && { "api-key": apiKey }),
      },
      query: {
        ...(type === "custom" && version && { "api-version": version }),
      },
    },
  ).on('content', (delta: string, snapshot: string) => {
    setStreamContent(messageId, snapshot, false);
  }).on('finalContent', (contentSnapshot: string) => {
    setStreamContent(messageId, contentSnapshot, true);
    setTotalTokens(chatId, contentSnapshot);
  });
}

function setStreamContent(
  messageId: string,
  content: string,
  isFinal: boolean
) {
  content = isFinal ? content : content + "█";
  db.messages.update(messageId, { content: content });
}

function setTotalTokens(chatId: string, content: string) {
  let total_tokens = encode(content).length;
  db.chats.where({ id: chatId }).modify((chat) => {
    if (chat.totalTokens) {
      chat.totalTokens += total_tokens;
    } else {
      chat.totalTokens = total_tokens;
    }
  });
}

export async function createChatCompletion(
  apiKey: string,
  messages: ChatCompletionMessageParam[]
) {
  const settings = await db.settings.get("general");
  const model = settings?.openAiModel ?? config.defaultModel;
  const type = settings?.openAiApiType ?? config.defaultType;
  const auth = settings?.openAiApiAuth ?? config.defaultAuth;
  const base = settings?.openAiApiBase ?? config.defaultBase;
  const version = settings?.openAiApiVersion ?? config.defaultVersion;

  const client = getClient(apiKey, type, auth, base);
  return client.chat.completions.create(
    {
      model,
      stream: false,
      messages,
    },
    {
      headers: {
        "Content-Type": "application/json",
        ...(type === "custom" && auth === "api-key" && { "api-key": apiKey }),
      },
      query: {
        ...(type === "custom" && version && { "api-version": version }),
      },
    }
  );
}

export async function checkOpenAIKey(apiKey: string) {
  return createChatCompletion(apiKey, [
    {
      role: "user",
      content: "hello",
    },
  ]);
}
