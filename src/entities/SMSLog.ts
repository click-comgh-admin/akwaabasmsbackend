// entities/SMSLog.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, BaseEntity } from "typeorm";

@Entity("sms_logs")
export class SMSLog extends BaseEntity {
  @PrimaryGeneratedColumn({ name: "id" })
  id!: number;

  @Column({ name: "recipient" })
  recipient!: string;

  @Column("text", { name: "content" })
  content!: string;

  @Column({ 
    type: "enum", 
    enum: ["pending", "sent", "failed"],
    default: "pending",
    name: "status"
  })
  status!: "pending" | "sent" | "failed";

  @Column({ type: "timestamp", name: "sentat" })
  sentAt!: Date;

  @Column({ name: "frequency" })
  frequency!: string;

  @Column({ name: "scheduleid" })
  scheduleId!: number;

  @Column({ name: "isadmin" })
  isAdmin!: boolean;

  @Column({ nullable: true, name: "templatename" })
  templateName?: string;

  @Column({ type: "int", default: 0, name: "retrycount" })
  retryCount!: number;

  @Column({ type: "text", nullable: true, name: "error" })
  error?: string;

  @Column({ nullable: true, name: "messageid" })
  messageId?: string;

  @Column({ type: "json", nullable: true, name: "response" })
  response?: any;

  @CreateDateColumn({ name: "createdat" })
  createdAt!: Date;
}