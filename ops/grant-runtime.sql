-- Run only against wanpet_dev as the migration owner or local PostgreSQL administrator.
GRANT USAGE ON SCHEMA public TO wanpet_app;
GRANT SELECT, INSERT, UPDATE ON "Account", "Player", "Pet", "Inventory" TO wanpet_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session" TO wanpet_app;
GRANT SELECT, INSERT ON "StarterGrant", "IdempotencyRecord" TO wanpet_app;
GRANT SELECT ON "_prisma_migrations" TO wanpet_app;
GRANT SELECT, INSERT, UPDATE ON "Trip", "CollectionEntry" TO wanpet_app;
GRANT SELECT, INSERT ON "TripLedger" TO wanpet_app;
GRANT SELECT, INSERT, UPDATE ON "PetLife" TO wanpet_app;
GRANT SELECT, INSERT, UPDATE ON "PetProfile" TO wanpet_app;
GRANT SELECT, INSERT, UPDATE ON "ChatRoom", "ChatTurn", "LongMemory", "ChatUsage", "SpeechJob" TO wanpet_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MemoryTask", "MemoryGarbage" TO wanpet_app;
GRANT SELECT, INSERT, DELETE ON "ChatEvent" TO wanpet_app;
GRANT USAGE, SELECT ON SEQUENCE "ChatEvent_id_seq" TO wanpet_app;
GRANT SELECT, INSERT, UPDATE ON "MediaAsset", "ImageJob", "ImageBudget", "ImageCharge", "ImageGift" TO wanpet_app;
