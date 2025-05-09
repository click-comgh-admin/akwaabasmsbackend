// migrations/[timestamp]-InitialSchemaSetup.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchemaSetup123456789 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enums first
        await queryRunner.query(`
            CREATE TYPE "public"."frequency_enum" AS ENUM (
                'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'
            );
        `);
        
        await queryRunner.query(`
            CREATE TYPE "public"."message_type_enum" AS ENUM (
                'Admin Summary', 'User Summary'
            );
        `);

        // Create Schedule table
        await queryRunner.query(`
            CREATE TABLE "schedule" (
                "id" SERIAL PRIMARY KEY,
                "senderName" VARCHAR(11) NOT NULL,
                "frequency" "frequency_enum" NOT NULL DEFAULT 'Monthly',
                "startTime" TIME NOT NULL,
                "lastSent" TIMESTAMP,
                "nextSend" TIMESTAMP NOT NULL,
                "meetingEventId" INTEGER NOT NULL,
                "template" TEXT NOT NULL,
                "clientCode" VARCHAR(50) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create Recipient table
        await queryRunner.query(`
            CREATE TABLE "recipient" (
                "id" SERIAL PRIMARY KEY,
                "phone" VARCHAR(20) NOT NULL,
                "scheduleId" INTEGER NOT NULL,
                "frequency" "frequency_enum" NOT NULL DEFAULT 'Monthly',
                "lastSent" TIMESTAMP,
                "messageType" "message_type_enum" NOT NULL DEFAULT 'User Summary',
                "clientCode" VARCHAR(50) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "FK_recipient_schedule" FOREIGN KEY ("scheduleId") 
                REFERENCES "schedule"("id") ON DELETE CASCADE
            );
        `);

        // Create indexes
        await queryRunner.query(`
            CREATE INDEX "IDX_schedule_clientCode" ON "schedule" ("clientCode");
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_recipient_clientCode" ON "recipient" ("clientCode");
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_recipient_phone" ON "recipient" ("phone");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables first
        await queryRunner.query(`DROP TABLE "recipient"`);
        await queryRunner.query(`DROP TABLE "schedule"`);
        
        // Then drop enums
        await queryRunner.query(`DROP TYPE "message_type_enum"`);
        await queryRunner.query(`DROP TYPE "frequency_enum"`);
    }
}