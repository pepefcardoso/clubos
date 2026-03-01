import type {
  WhatsAppProvider,
  SendMessageInput,
  SendMessageResult,
} from "../whatsapp.interface.js";
import { WhatsAppProviderError } from "../whatsapp.interface.js";

interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

/**
 * Reads and validates Z-API configuration from environment variables.
 * Throws at call time so misconfigured deployments fail loudly on first use.
 */
function getZApiConfig(): ZApiConfig {
  const instanceId = process.env["ZAPI_INSTANCE_ID"];
  const token = process.env["ZAPI_TOKEN"];
  const clientToken = process.env["ZAPI_CLIENT_TOKEN"];

  if (!instanceId || !token || !clientToken) {
    throw new Error(
      "Missing Z-API config. Required env vars: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN",
    );
  }

  return { instanceId, token, clientToken };
}

interface ZApiSendTextPayload {
  phone: string;
  message: string;
}

interface ZApiSendTextResponse {
  zaapId?: string;
  messageId?: string;
  id?: string;
  [key: string]: unknown;
}

/**
 * Z-API WhatsApp provider.
 *
 * API reference: https://developer.z-api.io
 * Endpoint: POST https://api.z-api.io/instances/{instanceId}/token/{token}/send-text
 * Auth: Client-Token header (ZAPI_CLIENT_TOKEN)
 *
 * Rate limiting and retry logic are handled by the BullMQ job layer (T-035),
 * not here. This provider is a thin, stateless HTTP adapter.
 */
export class ZApiProvider implements WhatsAppProvider {
  readonly name = "zapi";

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { instanceId, token, clientToken } = getZApiConfig();

    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

    const payload: ZApiSendTextPayload = {
      phone: input.phone,
      message: input.body,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": clientToken,
        },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      throw new WhatsAppProviderError(
        `Z-API network error: ${networkErr instanceof Error ? networkErr.message : "Unknown network failure"}`,
        this.name,
        networkErr,
      );
    }

    const raw = (await response.json()) as ZApiSendTextResponse;

    if (!response.ok) {
      throw new WhatsAppProviderError(
        `Z-API responded ${response.status}: ${JSON.stringify(raw)}`,
        this.name,
        raw,
      );
    }

    const providerMessageId = String(
      raw["zaapId"] ?? raw["messageId"] ?? raw["id"] ?? input.idempotencyKey,
    );

    return {
      providerMessageId,
      rawResponse: raw as Record<string, unknown>,
    };
  }
}
