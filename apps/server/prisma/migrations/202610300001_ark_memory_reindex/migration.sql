-- Rebuild from canonical active memories into the new model's separate collection.
UPDATE "ChatRoom" SET "needsReindex" = true
WHERE EXISTS (SELECT 1 FROM "LongMemory" WHERE "LongMemory"."petId" = "ChatRoom"."petId" AND "LongMemory".active = true);
