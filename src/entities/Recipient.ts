import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Recipient extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  phone!: string;

  @Column()
  scheduleId!: number;

  @Column()
  frequency!: string; // 'Daily', 'Weekly', 'Monthly', 'Quarterly'

  @Column({ type: 'timestamp' })
  lastSent!: Date;

  @Column()
  messageType!: string;
}