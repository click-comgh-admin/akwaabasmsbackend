import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Recipient extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  phone!: string;

  @Column()
  frequency!: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastSent!: Date;

  @Column({ nullable: true })
  scheduleId?: number;

  @Column()
  messageType!: string;

  @Column()
  clientCode!: string;

  @Column()
  isAdmin!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}

export default Recipient;