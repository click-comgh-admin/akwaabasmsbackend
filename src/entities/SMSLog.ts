import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'sms_log' })
export class SMSLog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  recipient!: string;

  @Column('text')
  message!: string;

  @Column()
  status!: string; // 'pending' | 'sent' | 'failed'

  @Column({ name: 'sentAt', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sentAt!: Date;

  @Column({ nullable: true })
  frequency?: string;

  @Column({ nullable: true })
  error?: string;

  @Column({ name: 'messageid', nullable: true })
  messageId?: string;

  @Column({ type: 'json', nullable: true })
  response?: any;
}