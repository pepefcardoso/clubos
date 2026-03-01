import type {
  WhatsAppProvider,
  SendMessageInput,
  SendMessageResult,
} from "../whatsapp.interface.js";
import { WhatsAppProviderError } from "../whatsapp.interface.js";

interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

/**
 * Reads and validates Evolution API configuration from environment variables.
 * Throws at call time so misconfigured deployments fail loudly on first use.
 */
function getEvolutionConfig(): EvolutionConfig {
  const apiUrl = process.env["EVOLUTION_API_URL"];
  const apiKey = process.env["EVOLUTION_API_KEY"];
  const instanceName = process.env["EVOLUTION_INSTANCE_NAME"] ?? "clubos";

  if (!apiUrl || !apiKey) {
    throw new Error(
      "Missing Evolution API config. Required env vars: EVOLUTION_API_URL, EVOLUTION_API_KEY",
    );
  }

  return { apiUrl, apiKey, instanceName };
}

interface EvolutionSendTextPayload {
  number: string;
  textMessage: {
    text: string;
  };
}

interface EvolutionSendTextResponse {
  key?: {
    id?: string;
    remoteJid?: string;
  };
  messageTimestamp?: number;
  [key: string]: unknown;
}

/**
 * Evolution API WhatsApp provider.
 *
 * API reference: https://doc.evolution-api.com
 * Endpoint: POST {EVOLUTION_API_URL}/message/sendText/{instanceName}
 * Auth: apikey header (EVOLUTION_API_KEY)
 *
 * Evolution API can be self-hosted or used as a cloud service.
 * Rate limiting and retry logic are handled by the BullMQ job layer (T-035),
 * not here. This provider is a thin, stateless HTTP adapter.
 */
export class EvolutionProvider implements WhatsAppProvider {
  readonly name = "evolution";

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { apiUrl, apiKey, instanceName } = getEvolutionConfig();

    const url = `${apiUrl}/message/sendText/${instanceName}`;

    const payload: EvolutionSendTextPayload = {
      number: input.phone,
      textMessage: {
        text: input.body,
      },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      throw new WhatsAppProviderError(
        `Evolution API network error: ${networkErr instanceof Error ? networkErr.message : "Unknown network failure"}`,
        this.name,
        networkErr,
      );
    }

    const raw = (await response.json()) as EvolutionSendTextResponse;

    if (!response.ok) {
      throw new WhatsAppProviderError(
        `Evolution API responded ${response.status}: ${JSON.stringify(raw)}`,
        this.name,
        raw,
      );
    }

    const providerMessageId = String(
      raw["key"]?.["id"] ?? input.idempotencyKey,
    );

    return {
      providerMessageId,
      rawResponse: raw as Record<string, unknown>,
    };
  }
}
