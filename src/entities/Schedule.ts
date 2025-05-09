import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Recipient } from "./Recipient";

@Entity()
export class Schedule extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 11 })
  senderName!: string;

  @Column({
    type: 'enum',
    enum: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'],
    default: 'Monthly'
  })
  frequency!: string;

  @Column({ type: 'time' })
  startTime!: string;

  // src/entities/Schedule.ts
@Column({ type: 'timestamp', nullable: true })
lastSent?: Date;  // Changed from Date | null to optional Date

  @Column({ type: 'timestamp' })
  nextSend!: Date;

  @Column()
  meetingEventId!: number;

  @Column({ type: 'text' })
  template!: string;

  @Column({ length: 50 })
  clientCode!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Recipient, recipient => recipient.schedule)
  recipients!: Recipient[];
}