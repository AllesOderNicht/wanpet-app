-- Forward-only: preserve existing development accounts and finite sessions.
BEGIN;
ALTER TABLE "Account" ADD COLUMN "email" VARCHAR(254);
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");
DROP INDEX "Account_username_key";
ALTER TABLE "Session" ALTER COLUMN "expiresAt" DROP NOT NULL;
COMMIT;
