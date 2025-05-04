// src/entities/SMSLog.ts
import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class SMSLog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  recipient: string;

  @Column('text')
  message: string;

  @Column()
  status: string;

  @Column()
  sentAt: Date;

  @Column({ type: 'json', nullable: true })
  response: any;
}