// src/entities/ScheduledMessage.ts
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { MessageType } from "./Recipient";

@Entity("scheduled_message") 
export class ScheduledMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  phone!: string;

  @Column('text')
  content!: string;

  @Column()
  frequency!: string;

  @Column({ name: 'start_date', type: 'timestamp without time zone' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'timestamp without time zone', nullable: true })
  endDate!: Date | null;

  @Column({ default: true })
  active!: boolean;

  @Column({ name: 'is_admin' })
  isAdmin!: boolean;

  @Column({ name: 'schedule_id', nullable: true })
  scheduleId!: number;

  @Column({ name: 'client_code' })
  clientCode!: string;

  @Column({ 
    name: 'message_type',
    type: 'varchar',
    enum: ['Admin Summary', 'User Summary']
  })
  messageType!: MessageType;

  @Column({ 
    name: 'created_at',
    type: 'timestamp without time zone',
    default: () => 'CURRENT_TIMESTAMP'
  })
  createdAt!: Date;
}