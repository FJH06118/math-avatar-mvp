import { randomUUID } from "node:crypto";
import {
  ApplicationSettingsSchema,
  ProviderCapabilitySchema,
  ProviderProfileSchema,
  type ProviderCapability,
  type ProviderProfile,
  type ProviderProfileCreateInput,
  type ProviderProfileUpdateInput,
  type ProviderTestResult,
} from "@ppt-digital-human/contracts";
import { AppHttpError } from "./errors.ts";
import { ProviderRepository, type ProviderProfileRecord } from "./provider-repository.ts";
import { SecretClientError, type SecretClient } from "./secret-client.ts";

export class ProviderService {
  constructor(
    private readonly repository: ProviderRepository,
    private readonly secretClient: SecretClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(principal: string): Promise<ProviderProfile[]> {
    return (await this.repository.list(principal)).map(toPublicProfile);
  }

  async settings(principal: string) {
    const records = await this.repository.list(principal);
    const providers = records.map(toPublicProfile);
    const updatedAt = records.reduce(
      (latest, record) => (record.updatedAt > latest ? record.updatedAt : latest),
      this.now(),
    );
    return ApplicationSettingsSchema.parse({
      revision: Math.max(1, ...records.map((record) => record.version)),
      defaultProviderId: providers.find((provider) => provider.isDefault)?.id ?? null,
      providers,
      updatedAt: updatedAt.toISOString(),
    });
  }

  async create(principal: string, input: ProviderProfileCreateInput): Promise<ProviderProfile> {
    const normalized = normalizeProviderInput(input);
    const credentialRef = `credential_${randomUUID()}`;
    let secret: { keyLast4: string; keyVersion: number } | undefined;
    if (input.apiKey !== undefined) {
      secret = await this.putSecret(credentialRef, input.apiKey);
    }
    try {
      const record = await this.repository.create({
        id: `provider_${randomUUID()}`,
        principal,
        ...normalized,
        credentialRef,
        keyConfigured: secret !== undefined,
        keyLast4: secret?.keyLast4 ?? null,
        keyVersion: secret?.keyVersion ?? 0,
      });
      return toPublicProfile(record);
    } catch (error: unknown) {
      if (secret) {
        try {
          await this.secretClient.remove(credentialRef);
        } catch {
          throw new AppHttpError(503, "SECRET_RECOVERY_REQUIRED", "Provider 密钥保存未完成，请重试。", true);
        }
      }
      throw error;
    }
  }

  async update(principal: string, id: string, input: ProviderProfileUpdateInput): Promise<ProviderProfile> {
    const existing = await this.require(principal, id);
    const kind = input.kind ?? parseKind(existing.kind);
    const protocol = input.protocol ?? parseProtocol(existing.protocol);
    assertCompatible(kind, protocol);
    const patch: Parameters<ProviderRepository["update"]>[3] = {
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.kind === undefined ? {} : { kind }),
      ...(input.protocol === undefined ? {} : { protocol }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: normalizeBaseUrl(input.baseUrl) }),
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
    };
    if (input.kind !== undefined || input.protocol !== undefined) {
      patch.capabilities = capabilitiesFor(kind);
    }
    if (input.apiKey !== undefined) {
      const secret = await this.putSecret(existing.credentialRef, input.apiKey);
      patch.keyConfigured = true;
      patch.keyLast4 = secret.keyLast4;
      patch.keyVersion = secret.keyVersion;
    }
    const record = await this.repository.update(principal, id, input.expectedVersion, patch);
    return toPublicProfile(record);
  }

  async setDefault(principal: string, id: string, expectedVersion: number): Promise<ProviderProfile> {
    return toPublicProfile(await this.repository.setDefault(principal, id, expectedVersion));
  }

  async delete(principal: string, id: string, expectedVersion: number): Promise<void> {
    const existing = await this.repository.delete(principal, id, expectedVersion);
    try {
      await this.secretClient.remove(existing.credentialRef);
    } catch {
      throw new AppHttpError(503, "SECRET_CLEANUP_REQUIRED", "Provider 已删除，但加密密钥清理需要重试。", true);
    }
  }

  async test(principal: string, id: string, expectedVersion: number): Promise<ProviderTestResult> {
    const existing = await this.require(principal, id);
    const testedAt = this.now();
    const base = {
      profileId: existing.id,
      latencyMs: null,
      model: existing.model,
      capabilities: parseCapabilities(existing.capabilities),
      testedAt: testedAt.toISOString(),
    };
    if (!existing.enabled) {
      return { ...base, status: "FAILED", errorCode: "PROFILE_DISABLED" };
    }
    if (!existing.keyConfigured || existing.keyVersion < 1) {
      return { ...base, status: "FAILED", errorCode: "CREDENTIAL_NOT_CONFIGURED" };
    }
    const startedAt = Date.now();
    try {
      if (!(await this.secretClient.has(existing.credentialRef, existing.keyVersion))) {
        return { ...base, status: "FAILED", errorCode: "CREDENTIAL_NOT_CONFIGURED" };
      }
    } catch (error: unknown) {
      if (error instanceof SecretClientError) {
        return { ...base, status: "FAILED", errorCode: "SECRET_STORE_UNAVAILABLE" };
      }
      throw error;
    }
    await this.repository.markTested(principal, id, expectedVersion, testedAt);
    return {
      ...base,
      status: "CONFIGURED",
      latencyMs: Math.max(0, Date.now() - startedAt),
      errorCode: null,
    };
  }

  private async require(principal: string, id: string): Promise<ProviderProfileRecord> {
    const record = await this.repository.get(principal, id);
    if (!record) throw new AppHttpError(404, "PROVIDER_PROFILE_NOT_FOUND", "Provider Profile 不存在。", false);
    return record;
  }

  private async putSecret(credentialRef: string, apiKey: string) {
    try {
      return await this.secretClient.put(credentialRef, apiKey);
    } catch (error: unknown) {
      if (error instanceof SecretClientError) {
        throw new AppHttpError(503, "SECRET_STORE_UNAVAILABLE", "Windows 安全密钥存储不可用，Provider 未保存。", true);
      }
      throw error;
    }
  }
}

function normalizeProviderInput(input: ProviderProfileCreateInput) {
  assertCompatible(input.kind, input.protocol);
  return {
    displayName: input.displayName,
    kind: input.kind,
    protocol: input.protocol,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model,
    enabled: input.enabled,
    isDefault: input.isDefault,
    capabilities: capabilitiesFor(input.kind),
  };
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function assertCompatible(kind: string, protocol: string): void {
  const expected = kind === "ANTHROPIC" ? "ANTHROPIC_MESSAGES" : "OPENAI_CHAT";
  if (protocol !== expected) {
    throw new AppHttpError(422, "PROVIDER_PROTOCOL_MISMATCH", "Provider 类型与协议不匹配。", false);
  }
}

function capabilitiesFor(kind: string): ProviderCapability[] {
  return kind === "ANTHROPIC" ? ["CHAT", "STREAMING"] : ["CHAT", "STRUCTURED_OUTPUT"];
}

function parseKind(value: string) {
  const parsed = ProviderProfileSchema.shape.kind.safeParse(value);
  if (!parsed.success) throw new AppHttpError(500, "PROVIDER_PROFILE_CORRUPT", "Provider Profile 数据无效。", false);
  return parsed.data;
}

function parseProtocol(value: string) {
  const parsed = ProviderProfileSchema.shape.protocol.safeParse(value);
  if (!parsed.success) throw new AppHttpError(500, "PROVIDER_PROFILE_CORRUPT", "Provider Profile 数据无效。", false);
  return parsed.data;
}

function parseCapabilities(value: unknown): ProviderCapability[] {
  const parsed = ProviderCapabilitySchema.array().safeParse(value);
  if (!parsed.success) throw new AppHttpError(500, "PROVIDER_PROFILE_CORRUPT", "Provider Profile 能力数据无效。", false);
  return parsed.data;
}

function toPublicProfile(record: ProviderProfileRecord): ProviderProfile {
  return ProviderProfileSchema.parse({
    id: record.id,
    displayName: record.displayName,
    kind: parseKind(record.kind),
    protocol: parseProtocol(record.protocol),
    baseUrl: record.baseUrl,
    model: record.model,
    enabled: record.enabled,
    isDefault: record.isDefault,
    capabilities: parseCapabilities(record.capabilities),
    version: record.version,
    keyConfigured: record.keyConfigured,
    keyLast4: record.keyLast4,
    keyVersion: record.keyVersion,
    lastTestAt: record.lastTestAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}
