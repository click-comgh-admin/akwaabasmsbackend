import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { Schedule } from "./Schedule";

@Entity()
export class Recipient extends BaseEntity { 
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
  phone!: string;

  @Column()
  scheduleId!: number;

  @ManyToOne(() => Schedule, schedule => schedule.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: Schedule;

  @Column({
    type: 'enum',
    enum: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'],
    default: 'Monthly'
  })
  frequency!: string;

@Column({ type: 'timestamp', nullable: true })
lastSent?: Date;  // Changed from Date | null to optional Date

  @Column({
    type: 'enum',
    enum: ['Admin Summary', 'User Summary'],
    default: 'User Summary'
  })
  messageType!: string;

  @Column({ length: 50 })
  clientCode!: string;

  @CreateDateColumn()
  createdAt!: Date;
}