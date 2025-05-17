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

  @Column({ type: 'timestamp', name: 'lastsent' })
  lastSent!: Date;

  @Column({ nullable: true, name: 'scheduleid' })
  scheduleId?: number;

  @ManyToOne(() => Schedule, schedule => schedule.recipients)
  schedule!: Schedule;

  @Column({ name: 'messagetype' })
  messageType!: string;

  @Column({ name: 'clientcode' })
  clientCode!: string;

  @Column({ default: false, name: 'isadmin' })
  isAdmin!: boolean;

  @Column({ type: 'timestamp', name: 'createdat', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}