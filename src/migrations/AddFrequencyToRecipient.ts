// src/migrations/AddFrequencyToRecipient.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFrequencyToRecipient1690000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipient" ADD COLUMN "frequency" character varying NOT NULL DEFAULT 'Daily'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "frequency"`);
    }
}
