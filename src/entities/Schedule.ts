import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Recipient } from './Recipient';

@Entity()
export class Schedule extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ name: 'starttime' })
  startTime!: string;

  @Column({ name: 'endtime' })
  endTime!: string;

  @Column({ name: 'days', type: 'simple-array' })
  days!: string[];

  @Column({ name: 'latenesstime', nullable: true })
  latenessTime?: string;

  @Column({ name: 'sendername', nullable: true })
  senderName?: string;

  @Column()
  frequency!: string;

  @Column({ name: 'meetingeventid' })
  meetingEventId!: number;

  @Column({ name: 'lastsent', type: 'timestamp', nullable: true })
  lastSent?: Date;

  @Column({ name: 'nextsend', type: 'timestamp', nullable: true })
  nextSend?: Date;

  @Column({ type: 'text', nullable: true })
  template?: string;

@Column({ name: 'isactive', default: true })  
isActive!: boolean;

  @OneToMany(() => Recipient, (recipient) => recipient.schedule)
  recipients!: Recipient[];
}