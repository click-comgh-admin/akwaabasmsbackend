// entities/CronLog.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class CronLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  jobType!: string; // e.g., "SMS_DELIVERY"

  @Column()
  status!: "started" | "completed" | "failed";

  @Column({ type: "text", nullable: true })
  details!: string;

  @Column({ type: "int", default: 0 })
  processedCount!: number;

  @CreateDateColumn()
  createdAt!: Date;
}