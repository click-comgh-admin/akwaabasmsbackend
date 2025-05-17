import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Schedule } from './Schedule';

@Entity()
export class Recipient extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  phone!: string;

  @Column()
  frequency!: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastSent!: Date;

  @Column({ nullable: true })
  scheduleId?: number;

  @ManyToOne(() => Schedule, schedule => schedule.recipients)
  schedule!: Schedule;

  @Column()
  messageType!: string;

  @Column()
  clientCode!: string;

  @Column({ default: false })
  isAdmin!: boolean;  // Add this line

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}