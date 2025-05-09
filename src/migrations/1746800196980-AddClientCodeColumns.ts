import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClientCodeColumns123456789 implements MigrationInterface {
    name = 'AddClientCodeColumns123456789';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "schedule" ADD COLUMN "clientCode" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD COLUMN "clientCode" character varying(50)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "clientCode"`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "clientCode"`);
    }
}