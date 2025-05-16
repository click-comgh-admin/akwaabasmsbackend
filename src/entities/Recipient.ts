import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { Schedule } from "./Schedule";

@Entity()
export class Recipient extends BaseEntity { 
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
  phone!: string;

  @Column({ name: 'scheduleid' }) // Match exact database column name
  scheduleId!: number;

  @ManyToOne(() => Schedule, schedule => schedule.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleid' }) // Match exact database column name
  schedule!: Schedule;

  @Column({
    type: 'enum',
    enum: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'],
    default: 'Monthly',
    name: 'frequency' // Match exact database column name
  })
  frequency!: string;

  @Column({ 
    type: 'timestamp', 
    name: 'lastsent', // Match exact database column name
    nullable: true 
  })
  lastSent?: Date;

  @Column({
    type: 'enum',
    enum: ['Admin Summary', 'User Summary'],
    default: 'User Summary',
    name: 'messagetype' // Match exact database column name
  })
  messageType!: string;

  @Column({ 
    type: 'varchar',
    length: 50,
    nullable: false,
    name: 'clientcode' // Match exact database column name
  })
  clientCode!: string;

  @CreateDateColumn({ name: 'createdat' }) // Match exact database column name
  createdAt!: Date;
}