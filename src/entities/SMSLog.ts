import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class SMSLog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  recipient!: string;

  @Column('text')
  message!: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  })
  status!: 'pending' | 'sent' | 'failed';

  @Column({ type: 'varchar', length: 255, nullable: true })
  error?: string;

  @Column({ name: 'sentAt', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sentAt!: Date;

  @Column({ type: 'varchar', nullable: true })
  frequency?: string;

  @Column({ type: 'json', nullable: true })
  response?: any;
}