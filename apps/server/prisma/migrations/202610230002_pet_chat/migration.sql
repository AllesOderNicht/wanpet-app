CREATE TABLE "ChatRoom" (
 "petId" UUID PRIMARY KEY REFERENCES "Pet"(id), "epoch" INTEGER NOT NULL DEFAULT 0,
 "needsReindex" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "ChatTurn" (
 id UUID PRIMARY KEY, "petId" UUID NOT NULL REFERENCES "ChatRoom"("petId"), "sessionId" UUID NOT NULL,
 surface TEXT NOT NULL DEFAULT 'interior', epoch INTEGER NOT NULL, "userText" TEXT NOT NULL, reply TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
 error TEXT, attempt INTEGER NOT NULL DEFAULT 1, hidden BOOLEAN NOT NULL DEFAULT false, invitation JSONB,
 "memoryStatus" TEXT NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "ChatTurn_petId_createdAt_idx" ON "ChatTurn"("petId", "createdAt");
CREATE UNIQUE INDEX "ChatTurn_one_active" ON "ChatTurn"("petId") WHERE status IN ('queued','running');
CREATE TABLE "ChatEvent" (id SERIAL PRIMARY KEY, "turnId" UUID NOT NULL REFERENCES "ChatTurn"(id) ON DELETE CASCADE, type TEXT NOT NULL, data JSONB NOT NULL);
CREATE INDEX "ChatEvent_turnId_id_idx" ON "ChatEvent"("turnId", id);
CREATE TABLE "LongMemory" (
 id UUID PRIMARY KEY, "petId" UUID NOT NULL REFERENCES "ChatRoom"("petId"), text TEXT NOT NULL,
 "sourceTurnId" UUID, "providerId" TEXT, active BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "LongMemory_petId_active_idx" ON "LongMemory"("petId", active);
CREATE TABLE "MemoryTask" ("turnId" UUID PRIMARY KEY REFERENCES "ChatTurn"(id) ON DELETE CASCADE, epoch INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, "nextAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now());
CREATE TABLE "MemoryGarbage" (scope TEXT PRIMARY KEY, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now());
CREATE TABLE "SpeechJob" (id UUID PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"(id), status TEXT NOT NULL DEFAULT 'queued', text TEXT NOT NULL DEFAULT '', error TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now());
CREATE INDEX "SpeechJob_accountId_createdAt_idx" ON "SpeechJob"("accountId", "createdAt");
CREATE TABLE "ChatUsage" ("accountId" UUID NOT NULL REFERENCES "Account"(id), day TEXT NOT NULL, turns INTEGER NOT NULL DEFAULT 0, PRIMARY KEY ("accountId", day));
