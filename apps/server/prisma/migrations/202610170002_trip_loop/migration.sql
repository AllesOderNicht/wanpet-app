BEGIN;

CREATE TYPE "TripLedgerKind" AS ENUM ('DEPARTURE', 'CLAIM');

CREATE TABLE "Trip" (
  "id" UUID PRIMARY KEY,
  "playerId" UUID NOT NULL REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "configVersion" TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "loadout" JSONB NOT NULL CHECK (jsonb_typeof("loadout") = 'array'),
  "rewards" JSONB NOT NULL CHECK (jsonb_typeof("rewards") = 'array'),
  "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "returnAt" TIMESTAMPTZ(3) NOT NULL,
  "claimedAt" TIMESTAMPTZ(3),
  "claimResponse" JSONB,
  CONSTRAINT "Trip_time_order" CHECK ("returnAt" > "startedAt" AND ("claimedAt" IS NULL OR "claimedAt" >= "returnAt")),
  CONSTRAINT "Trip_claim_consistent" CHECK (("claimedAt" IS NULL) = ("claimResponse" IS NULL))
);
CREATE INDEX "Trip_playerId_startedAt_idx" ON "Trip"("playerId", "startedAt");
CREATE UNIQUE INDEX "Trip_one_unclaimed_per_player" ON "Trip"("playerId") WHERE "claimedAt" IS NULL;

CREATE TABLE "TripLedger" (
  "id" UUID PRIMARY KEY,
  "tripId" UUID NOT NULL REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" "TripLedgerKind" NOT NULL,
  "items" JSONB NOT NULL CHECK (jsonb_typeof("items") = 'array'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TripLedger_tripId_kind_key" ON "TripLedger"("tripId", "kind");

CREATE TABLE "CollectionEntry" (
  "playerId" UUID NOT NULL REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "firstCollectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("playerId", "itemId")
);

COMMIT;
