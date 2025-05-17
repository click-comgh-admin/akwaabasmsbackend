import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'sms_log' }) // Explicitly set table name to match database
export class SMSLog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  recipient!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column()
  status!: string; // 'pending' | 'sent' | 'failed'

  @Column({ 
    type: 'timestamp', 
    name: 'sentat', // Match database column name
    default: () => 'CURRENT_TIMESTAMP' 
  })
  sentAt!: Date;

  @Column({ nullable: true })
  frequency?: string;

  @Column({ nullable: true })
  error?: string;

  @Column({ 
    nullable: true,
    name: 'messageid' // Match database column name
  })
  messageId?: string;

  @Column({ 
    type: 'json', 
    nullable: true,
    name: 'response' // Explicitly match database column name
  })
  response?: any;
}