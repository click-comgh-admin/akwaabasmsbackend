import { BaseEntity,Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Recipient extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  phone!: string;

  @Column()
  scheduleId!: number;
}

