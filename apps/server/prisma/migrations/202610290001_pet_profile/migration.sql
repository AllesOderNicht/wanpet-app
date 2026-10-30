CREATE TABLE "PetProfile" (
    "petId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "voice" VARCHAR(16) NOT NULL DEFAULT 'gentle',
    "temperament" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PetProfile_pkey" PRIMARY KEY ("petId"),
    CONSTRAINT "PetProfile_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PetProfile_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "PetProfile_voice_check" CHECK ("voice" IN ('gentle', 'playful', 'quiet'))
);
-- Existing identities and life JSON remain intact. Profile defaults reuse their saved temperament.
