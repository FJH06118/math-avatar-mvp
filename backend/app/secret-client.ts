import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ProviderApiKeySchema } from "@ppt-digital-human/contracts";

const CredentialRefSchema = z.string().regex(/^credential_[A-Za-z0-9_-]{16,96}$/);
const RequestIdSchema = z.string().regex(/^secret_[A-Za-z0-9-]{20,80}$/);

const SecretRequestSchema = z.discriminatedUnion("operation", [
  z
    .object({
      type: z.literal("provider-secret-request"),
      protocolVersion: z.literal(1),
      requestId: RequestIdSchema,
      operation: z.literal("put"),
      credentialRef: CredentialRefSchema,
      apiKey: ProviderApiKeySchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("provider-secret-request"),
      protocolVersion: z.literal(1),
      requestId: RequestIdSchema,
      operation: z.literal("has"),
      credentialRef: CredentialRefSchema,
      keyVersion: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("provider-secret-request"),
      protocolVersion: z.literal(1),
      requestId: RequestIdSchema,
      operation: z.literal("get"),
      credentialRef: CredentialRefSchema,
      keyVersion: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("provider-secret-request"),
      protocolVersion: z.literal(1),
      requestId: RequestIdSchema,
      operation: z.literal("remove"),
      credentialRef: CredentialRefSchema,
    })
    .strict(),
]);
type SecretRequestInput = z.infer<typeof SecretRequestSchema>;
type SecretRequestOperation =
  | { operation: "put"; credentialRef: string; apiKey: string }
  | { operation: "has"; credentialRef: string; keyVersion: number }
  | { operation: "get"; credentialRef: string; keyVersion: number }
  | { operation: "remove"; credentialRef: string };

const SecretResponseSchema = z
  .object({
    type: z.literal("provider-secret-response"),
    protocolVersion: z.literal(1),
    requestId: RequestIdSchema,
    ok: z.boolean(),
    keyLast4: z.string().max(4).optional(),
    keyVersion: z.number().int().min(0).optional(),
    exists: z.boolean().optional(),
    apiKey: z.string().optional(),
    errorCode: z
      .enum(["SECRET_IPC_UNAVAILABLE", "SECRET_STORE_UNAVAILABLE", "SECRET_NOT_FOUND", "SECRET_STORAGE_CORRUPT"])
      .optional(),
  })
  .strict();

export interface SecretPutResult {
  keyLast4: string;
  keyVersion: number;
}

export interface SecretClient {
  put(credentialRef: string, apiKey: string): Promise<SecretPutResult>;
  has(credentialRef: string, keyVersion: number): Promise<boolean>;
  get(credentialRef: string, keyVersion: number): Promise<string>;
  remove(credentialRef: string): Promise<void>;
}

export class SecretClientError extends Error {
  constructor(readonly code: "SECRET_IPC_UNAVAILABLE" | "SECRET_STORE_UNAVAILABLE" | "SECRET_NOT_FOUND" | "SECRET_STORAGE_CORRUPT") {
    super("Provider secret operation failed.");
    this.name = "SecretClientError";
  }
}

export class IpcSecretClient implements SecretClient {
  readonly #pending = new Map<
    string,
    { resolve: (response: z.infer<typeof SecretResponseSchema>) => void; reject: (error: unknown) => void; timeout: NodeJS.Timeout }
  >();
  readonly #onMessage = (message: unknown): void => {
    const parsed = SecretResponseSchema.safeParse(message);
    if (!parsed.success) return;
    const pending = this.#pending.get(parsed.data.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.#pending.delete(parsed.data.requestId);
    pending.resolve(parsed.data);
  };

  constructor(private readonly timeoutMs = 5_000) {
    process.on("message", this.#onMessage);
  }

  put(credentialRef: string, apiKey: string): Promise<SecretPutResult> {
    return this.#request({
      operation: "put",
      credentialRef,
      apiKey,
    }).then((response) => {
      if (!response.ok || response.keyVersion === undefined || response.keyLast4 === undefined) {
        throw new SecretClientError(response.errorCode ?? "SECRET_STORE_UNAVAILABLE");
      }
      return { keyLast4: response.keyLast4, keyVersion: response.keyVersion };
    });
  }

  has(credentialRef: string, keyVersion: number): Promise<boolean> {
    return this.#request({ operation: "has", credentialRef, keyVersion }).then((response) => {
      if (!response.ok) throw new SecretClientError(response.errorCode ?? "SECRET_STORE_UNAVAILABLE");
      return response.exists === true;
    });
  }

  get(credentialRef: string, keyVersion: number): Promise<string> {
    return this.#request({ operation: "get", credentialRef, keyVersion }).then((response) => {
      if (!response.ok || response.apiKey === undefined) {
        throw new SecretClientError(response.errorCode ?? "SECRET_NOT_FOUND");
      }
      return response.apiKey;
    });
  }

  remove(credentialRef: string): Promise<void> {
    return this.#request({ operation: "remove", credentialRef }).then((response) => {
      if (!response.ok) throw new SecretClientError(response.errorCode ?? "SECRET_STORE_UNAVAILABLE");
    });
  }

  async #request(
    input: SecretRequestOperation,
  ): Promise<z.infer<typeof SecretResponseSchema>> {
    if (typeof process.send !== "function" || process.connected !== true) {
      throw new SecretClientError("SECRET_IPC_UNAVAILABLE");
    }
    const requestId = `secret_${randomUUID()}`;
    const request = SecretRequestSchema.parse({
      type: "provider-secret-request",
      protocolVersion: 1,
      requestId,
      ...input,
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new SecretClientError("SECRET_IPC_UNAVAILABLE"));
      }, this.timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timeout });
      try {
        process.send?.(request, (error) => {
          if (!error) return;
          clearTimeout(timeout);
          this.#pending.delete(requestId);
          reject(new SecretClientError("SECRET_IPC_UNAVAILABLE"));
        });
      } catch {
        clearTimeout(timeout);
        this.#pending.delete(requestId);
        reject(new SecretClientError("SECRET_IPC_UNAVAILABLE"));
      }
    });
  }
}

export class InMemorySecretClient implements SecretClient {
  readonly #values = new Map<string, Map<number, string>>();

  async put(credentialRef: string, apiKey: string): Promise<SecretPutResult> {
    const versions = this.#values.get(credentialRef) ?? new Map<number, string>();
    const keyVersion = Math.max(0, ...versions.keys()) + 1;
    versions.set(keyVersion, apiKey);
    this.#values.set(credentialRef, versions);
    return { keyLast4: apiKey.slice(-4), keyVersion };
  }

  async has(credentialRef: string, keyVersion: number): Promise<boolean> {
    return this.#values.get(credentialRef)?.has(keyVersion) === true;
  }

  async get(credentialRef: string, keyVersion: number): Promise<string> {
    const value = this.#values.get(credentialRef)?.get(keyVersion);
    if (value === undefined) throw new SecretClientError("SECRET_NOT_FOUND");
    return value;
  }

  async remove(credentialRef: string): Promise<void> {
    this.#values.delete(credentialRef);
  }
}

export class UnavailableSecretClient implements SecretClient {
  async put(): Promise<SecretPutResult> {
    throw new SecretClientError("SECRET_IPC_UNAVAILABLE");
  }

  async has(): Promise<boolean> {
    throw new SecretClientError("SECRET_IPC_UNAVAILABLE");
  }

  async get(): Promise<string> {
    throw new SecretClientError("SECRET_IPC_UNAVAILABLE");
  }

  async remove(): Promise<void> {
    throw new SecretClientError("SECRET_IPC_UNAVAILABLE");
  }
}

export function createIpcSecretClient(): SecretClient {
  return new IpcSecretClient();
}
