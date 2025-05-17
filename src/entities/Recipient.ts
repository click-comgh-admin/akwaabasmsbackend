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

  @Column({ name: 'lastSent', type: 'timestamp' })
  lastSent!: Date;

  @Column({ name: 'scheduleId' })
  scheduleId!: number;

  @ManyToOne(() => Schedule, schedule => schedule.recipients)
  schedule!: Schedule;

  @Column({ name: 'messagetype' })
  messageType!: string;

  @Column({ name: 'clientcode' })
  clientCode!: string;

  @Column({ name: 'isadmin', default: false })
  isAdmin!: boolean;

  @Column({ name: 'createdat', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}