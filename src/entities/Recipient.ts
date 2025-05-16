import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { Schedule } from "./Schedule";

@Entity()
export class Recipient extends BaseEntity { 
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 20 })
  phone!: string;

  @Column({ name: 'scheduleid' }) 
  scheduleId!: number;

  @ManyToOne(() => Schedule, schedule => schedule.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleid' })
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
    name: 'messagetype' 
  })
  messageType!: string;

  @Column({ 
    type: 'varchar',
    length: 50,
    nullable: false,
    name: 'clientcode' 
  })
  clientCode!: string;

  @CreateDateColumn({ name: 'createdat' }) 
  createdAt!: Date;
}