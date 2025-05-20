// entities/Recipient.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, BaseEntity } from "typeorm";
import { Schedule } from "./Schedule";

export enum MessageType {
  ADMIN_SUMMARY = "Admin Summary",
  USER_SUMMARY = "User Summary",
}

@Entity("recipients")
export class Recipient extends BaseEntity {
  @PrimaryGeneratedColumn({ name: "id" })
  id!: number;

  @Column({ name: "phone" })
  phone!: string;

  @Column({ name: "schedule_id" })
  scheduleId!: number;

  @ManyToOne(() => Schedule, (schedule) => schedule.recipients)
  schedule!: Schedule;

  @Column({ name: "frequency" })
  frequency!: string;

  @Column({ name: "start_date", type: "date", nullable: true })
  startDate?: Date;

  @Column({ name: "last_sent", type: "timestamp", nullable: true })
  lastSent?: Date;

  @Column({ name: "next_send_date", type: 'timestamp' })
  nextSendDate!: Date; 

  @Column({ name: "message_type", type: "enum", enum: MessageType })
  messageType!: MessageType;

  @Column({ name: "org_id", nullable: true })
  orgId?: string;

@Column({ name: 'clientcode', nullable: true })
clientCode?: string;


  @Column({ name: "is_admin", default: false })
  isAdmin!: boolean;


@CreateDateColumn({ name: 'createdat' })
createdAt!: Date;

@UpdateDateColumn({ name: 'updatedat' })
updatedAt!: Date;

  @Column({ name: "retry_attempts", default: 0 })
  retryAttempts!: number;

  @Column({ name: "next_retry_at", nullable: true, type: 'timestamp' })
  nextRetryAt?: Date;

  @Column({ name: "is_active", default: false })
  isActive!: boolean;
}