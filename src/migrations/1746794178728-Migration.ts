import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1746794178728 implements MigrationInterface {
    name = 'Migration1746794178728'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipient" ADD "clientCode" character varying(50) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "clientCode" character varying(50) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "phone"`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD "phone" character varying(20) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "frequency"`);
        await queryRunner.query(`CREATE TYPE "public"."recipient_frequency_enum" AS ENUM('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually')`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD "frequency" "public"."recipient_frequency_enum" NOT NULL DEFAULT 'Monthly'`);
        await queryRunner.query(`ALTER TABLE "recipient" ALTER COLUMN "lastSent" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recipient" ALTER COLUMN "lastSent" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "messageType"`);
        await queryRunner.query(`CREATE TYPE "public"."recipient_messagetype_enum" AS ENUM('Admin Summary', 'User Summary')`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD "messageType" "public"."recipient_messagetype_enum" NOT NULL DEFAULT 'User Summary'`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "senderName"`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "senderName" character varying(11) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "frequency"`);
        await queryRunner.query(`CREATE TYPE "public"."schedule_frequency_enum" AS ENUM('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually')`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "frequency" "public"."schedule_frequency_enum" NOT NULL DEFAULT 'Monthly'`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "startTime"`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "startTime" TIME NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD CONSTRAINT "FK_9d7299bb590630c86f2ca60805f" FOREIGN KEY ("scheduleId") REFERENCES "schedule"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipient" DROP CONSTRAINT "FK_9d7299bb590630c86f2ca60805f"`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "startTime"`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "startTime" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "frequency"`);
        await queryRunner.query(`DROP TYPE "public"."schedule_frequency_enum"`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "frequency" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "senderName"`);
        await queryRunner.query(`ALTER TABLE "schedule" ADD "senderName" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "messageType"`);
        await queryRunner.query(`DROP TYPE "public"."recipient_messagetype_enum"`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD "messageType" character varying NOT NULL DEFAULT 'SMS'`);
        await queryRunner.query(`ALTER TABLE "recipient" ALTER COLUMN "lastSent" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "recipient" ALTER COLUMN "lastSent" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "frequency"`);
        await queryRunner.query(`DROP TYPE "public"."recipient_frequency_enum"`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD "frequency" character varying NOT NULL DEFAULT 'Daily'`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "phone"`);
        await queryRunner.query(`ALTER TABLE "recipient" ADD "phone" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "schedule" DROP COLUMN "clientCode"`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "recipient" DROP COLUMN "clientCode"`);
    }

}
