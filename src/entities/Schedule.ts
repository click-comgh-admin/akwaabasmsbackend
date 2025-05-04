// src/entities/Schedule.ts
import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Schedule extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  senderName: string;

  @Column()
  frequency: string;

  @Column()
  startTime: string;

  @Column({ nullable: true })
  lastSent: Date;

  @Column()
  nextSend: Date;

  @Column()
  meetingEventId: number;

  @Column({ type: 'text' })
  template: string;
}


