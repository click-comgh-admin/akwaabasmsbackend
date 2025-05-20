// entities/CronLog.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity({ name: 'cron_log' })  // Explicit table name
export class CronLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'jobtype' })  // Match exact column name
  jobType!: string;

  @Column()
  status!: 'started' | 'completed' | 'failed';

  @Column({ type: 'text', nullable: true })
  details?: string;

  @Column({ name: 'processedcount', default: 0 })
  processedCount!: number;

  @CreateDateColumn({ name: 'createdat' })
  createdAt!: Date;
}