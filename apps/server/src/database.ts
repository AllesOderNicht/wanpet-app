import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export const MIGRATION = '202610290002_email_persistent_sessions';
export const MIGRATIONS = ['202610170001_backend_foundation', '202610170002_trip_loop', '202610230001_cat_life', '202610230002_pet_chat', '202610230003_memory_task_generation', '202610230004_pet_images', '202610290001_pet_profile', MIGRATION];
@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() { await this.$disconnect(); }
}
export type Transaction = Prisma.TransactionClient;
export async function databaseNow(db: Transaction): Promise<Date> {
  // CURRENT_TIMESTAMP is the transaction start, which can precede a long account-lock wait.
  const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return rows[0]!.now;
}
