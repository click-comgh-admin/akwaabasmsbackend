import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Recipient } from './Recipient';

@Entity()
export class Schedule extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  startTime!: string;

  @Column()
  endTime!: string;

  @Column('simple-array')
  days!: string[];

  @Column({ nullable: true })
  latenessTime?: string;

  @Column({ nullable: true })
  senderName?: string;

  @Column()
  frequency!: string; // 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annually'

  @Column()
  meetingEventId!: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSent?: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextSend?: Date;

  @Column({ type: 'text', nullable: true })
  template?: string;

  @OneToMany(() => Recipient, recipient => recipient.schedule)
  recipients!: Recipient[];
}