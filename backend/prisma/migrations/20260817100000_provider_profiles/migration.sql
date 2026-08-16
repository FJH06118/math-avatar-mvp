CREATE TABLE "ProviderProfile" (
    "id" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "version" INTEGER NOT NULL DEFAULT 1,
    "credentialRef" TEXT NOT NULL,
    "keyConfigured" BOOLEAN NOT NULL DEFAULT false,
    "keyLast4" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 0,
    "lastTestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderProfile_credentialRef_key" ON "ProviderProfile"("credentialRef");
CREATE INDEX "ProviderProfile_principal_updatedAt_idx" ON "ProviderProfile"("principal", "updatedAt");
CREATE INDEX "ProviderProfile_principal_isDefault_idx" ON "ProviderProfile"("principal", "isDefault");
CREATE UNIQUE INDEX "ProviderProfile_one_default_per_principal_key"
  ON "ProviderProfile"("principal")
  WHERE "isDefault" = true;
