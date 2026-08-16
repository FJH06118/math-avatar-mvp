import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type {
  ProviderCapability,
  ProviderKind,
  ProviderProtocol,
} from "@ppt-digital-human/contracts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";

export interface ProviderProfileWrite {
  id: string;
  principal: string;
  displayName: string;
  kind: ProviderKind;
  protocol: ProviderProtocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  capabilities: ProviderCapability[];
  credentialRef: string;
  keyConfigured: boolean;
  keyLast4: string | null;
  keyVersion: number;
}

export type ProviderProfileRecord = Prisma.ProviderProfileGetPayload<{}>;

export class ProviderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(principal: string): Promise<ProviderProfileRecord[]> {
    return this.prisma.providerProfile.findMany({
      where: { principal },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
  }

  async get(principal: string, id: string): Promise<ProviderProfileRecord | null> {
    return this.prisma.providerProfile.findFirst({ where: { principal, id } });
  }

  async create(input: ProviderProfileWrite): Promise<ProviderProfileRecord> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (input.isDefault) {
          await transaction.providerProfile.updateMany({
            where: { principal: input.principal },
            data: { isDefault: false },
          });
        }
        return transaction.providerProfile.create({ data: input });
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new AppHttpError(409, "PROVIDER_PROFILE_CONFLICT", "Provider Profile 已存在或默认选择发生冲突。", false);
      }
      throw error;
    }
  }

  async update(
    principal: string,
    id: string,
    expectedVersion: number,
    patch: Partial<Omit<ProviderProfileWrite, "id" | "principal" | "credentialRef">>,
  ): Promise<ProviderProfileRecord> {
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        if (patch.isDefault === true) {
          await transaction.providerProfile.updateMany({
            where: { principal },
            data: { isDefault: false },
          });
        }
        const result = await transaction.providerProfile.updateMany({
          where: { id, principal, version: expectedVersion },
          data: {
            ...patch,
            version: { increment: 1 },
          },
        });
        return result.count;
      });
      if (updated !== 1) await this.assertVersion(principal, id, expectedVersion);
      const record = await this.get(principal, id);
      if (!record) throw new AppHttpError(404, "PROVIDER_PROFILE_NOT_FOUND", "Provider Profile 不存在。", false);
      return record;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new AppHttpError(409, "PROVIDER_PROFILE_CONFLICT", "Provider Profile 已存在或默认选择发生冲突。", false);
      }
      throw error;
    }
  }

  async setDefault(principal: string, id: string, expectedVersion: number): Promise<ProviderProfileRecord> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const target = await transaction.providerProfile.findFirst({ where: { principal, id } });
        if (!target) throw new AppHttpError(404, "PROVIDER_PROFILE_NOT_FOUND", "Provider Profile 不存在。", false);
        if (target.version !== expectedVersion) {
          throw new AppHttpError(409, "STALE_PROVIDER_PROFILE", "Provider Profile 已有更新，请刷新后重试。", false);
        }
        await transaction.providerProfile.updateMany({ where: { principal }, data: { isDefault: false } });
        await transaction.providerProfile.update({
          where: { id },
          data: { isDefault: true, version: { increment: 1 } },
        });
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new AppHttpError(409, "PROVIDER_PROFILE_CONFLICT", "默认 Provider Profile 发生并发冲突。", false);
      }
      throw error;
    }
    const record = await this.get(principal, id);
    if (!record) throw new AppHttpError(404, "PROVIDER_PROFILE_NOT_FOUND", "Provider Profile 不存在。", false);
    return record;
  }

  async markTested(
    principal: string,
    id: string,
    expectedVersion: number,
    lastTestAt: Date,
  ): Promise<ProviderProfileRecord> {
    const updated = await this.prisma.providerProfile.updateMany({
      where: { principal, id, version: expectedVersion },
      data: { lastTestAt, version: { increment: 1 } },
    });
    if (updated.count !== 1) await this.assertVersion(principal, id, expectedVersion);
    const record = await this.get(principal, id);
    if (!record) throw new AppHttpError(404, "PROVIDER_PROFILE_NOT_FOUND", "Provider Profile 不存在。", false);
    return record;
  }

  async delete(principal: string, id: string, expectedVersion: number): Promise<ProviderProfileRecord> {
    const existing = await this.get(principal, id);
    if (!existing) throw new AppHttpError(404, "PROVIDER_PROFILE_NOT_FOUND", "Provider Profile 不存在。", false);
    if (existing.version !== expectedVersion) {
      throw new AppHttpError(409, "STALE_PROVIDER_PROFILE", "Provider Profile 已有更新，请刷新后重试。", false);
    }
    if (existing.isDefault) {
      throw new AppHttpError(409, "DEFAULT_PROVIDER_DELETE_FORBIDDEN", "不能删除当前默认 Provider Profile。", false);
    }
    const deleted = await this.prisma.providerProfile.deleteMany({
      where: { principal, id, version: expectedVersion },
    });
    if (deleted.count !== 1) await this.assertVersion(principal, id, expectedVersion);
    return existing;
  }

  private async assertVersion(principal: string, id: string, expectedVersion: number): Promise<never> {
    const current = await this.get(principal, id);
    if (!current) throw new AppHttpError(404, "PROVIDER_PROFILE_NOT_FOUND", "Provider Profile 不存在。", false);
    throw new AppHttpError(
      409,
      "STALE_PROVIDER_PROFILE",
      `Provider Profile 版本冲突：expected=${expectedVersion}，current=${current.version}。`,
      false,
    );
  }
}
