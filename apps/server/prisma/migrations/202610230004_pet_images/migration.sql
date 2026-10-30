ALTER TABLE "ChatTurn" ADD COLUMN "imageRoll" INTEGER NOT NULL DEFAULT 100,
 ADD COLUMN "imageIntent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatTurn" ADD CONSTRAINT "ChatTurn_image_roll" CHECK ("imageRoll" BETWEEN 0 AND 100);

CREATE TABLE "MediaAsset" (
 "id" UUID PRIMARY KEY, "accountId" UUID REFERENCES "Account"("id") ON DELETE RESTRICT,
 "turnId" UUID REFERENCES "ChatTurn"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL, "width" INTEGER NOT NULL, "height" INTEGER NOT NULL, "bytes" INTEGER NOT NULL,
 "destination" TEXT, "appearance" TEXT, "theme" TEXT, "style" TEXT,
 "deletedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MediaAsset_shape" CHECK ("width">0 AND "height">0 AND "bytes">0),
 CONSTRAINT "MediaAsset_owner" CHECK (("kind"='postcard' AND "accountId" IS NULL AND "turnId" IS NULL AND "destination" IS NOT NULL AND "appearance" IS NOT NULL AND "theme" IS NOT NULL AND "style" IS NOT NULL) OR ("kind" IN ('upload','chat') AND "accountId" IS NOT NULL))
);
CREATE INDEX "MediaAsset_accountId_turnId_idx" ON "MediaAsset"("accountId","turnId");
CREATE INDEX "MediaAsset_kind_destination_appearance_theme_style_idx" ON "MediaAsset"("kind","destination","appearance","theme","style");

CREATE TABLE "ImageJob" (
 "id" UUID PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
 "petId" UUID NOT NULL, "turnId" UUID UNIQUE REFERENCES "ChatTurn"("id") ON DELETE RESTRICT,
 "tripId" UUID UNIQUE REFERENCES "Trip"("id") ON DELETE RESTRICT,
 "epoch" INTEGER, "origin" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "prompt" TEXT NOT NULL,
 "referenceIds" TEXT[] NOT NULL DEFAULT '{}', "destination" TEXT, "appearance" TEXT, "theme" TEXT, "style" TEXT,
 "imageId" UUID REFERENCES "MediaAsset"("id") ON DELETE RESTRICT, "error" TEXT, "attempt" INTEGER NOT NULL DEFAULT 1,
 "model" TEXT, "resultUrl" TEXT, "submittedAt" TIMESTAMPTZ(3),
 "nextAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "saveAttempts" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ImageJob_origin" CHECK (("origin"='postcard' AND "tripId" IS NOT NULL AND "turnId" IS NULL) OR ("origin" IN ('request','proposal','gift') AND "turnId" IS NOT NULL AND "tripId" IS NULL AND "epoch" IS NOT NULL)),
 CONSTRAINT "ImageJob_status" CHECK ("status" IN ('proposed','queued','submitted','saving','completed','failed','unknown','cancelled','fallback')),
 CONSTRAINT "ImageJob_attempt" CHECK ("attempt">0 AND cardinality("referenceIds")<=4)
);
CREATE INDEX "ImageJob_status_nextAt_idx" ON "ImageJob"("status","nextAt");
CREATE INDEX "ImageJob_accountId_createdAt_idx" ON "ImageJob"("accountId","createdAt");
CREATE TABLE "ImageBudget" ("day" VARCHAR(10) PRIMARY KEY, "usedFen" INTEGER NOT NULL DEFAULT 0 CHECK ("usedFen">=0));
CREATE TABLE "ImageCharge" (
 "jobId" UUID NOT NULL REFERENCES "ImageJob"("id") ON DELETE RESTRICT, "attempt" INTEGER NOT NULL,
 "day" VARCHAR(10) NOT NULL, "amountFen" INTEGER NOT NULL CHECK ("amountFen">0),
 "status" TEXT NOT NULL DEFAULT 'reserved' CHECK ("status" IN ('reserved','charged','uncertain','released')),
 PRIMARY KEY ("jobId","attempt")
);
CREATE TABLE "ImageGift" ("petId" UUID NOT NULL, "day" VARCHAR(10) NOT NULL, "turnId" UUID NOT NULL UNIQUE, PRIMARY KEY ("petId","day"));
