// entities/ScheduledMessage.ts
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { MessageType } from "./Recipient";

@Entity()
export class ScheduledMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  phone!: string;

  @Column('text')
  content!: string;

  @Column()
  frequency!: string; 

  @Column({ type: 'timestamp' })
  startDate!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate!: Date | null;

  @Column({ default: true })
  active!: boolean;

  @Column()
  isAdmin!: boolean;

  @Column({ nullable: true })
  scheduleId!: number;

  @Column()
  clientCode!: string;

  @Column({ type: 'enum', enum: MessageType })
  messageType!: MessageType;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}