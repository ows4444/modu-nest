import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  Index, 
  CreateDateColumn, 
  UpdateDateColumn 
} from 'typeorm';

@Entity('plugin_trust_levels')
@Index(['pluginName'])
@Index(['pluginName', 'version'], { unique: true })
@Index(['trustLevel'])
@Index(['assignedBy'])
@Index(['validUntil'])
export class PluginTrustLevelEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pluginName: string;

  @Column({ nullable: true })
  version: string;

  @Column({ 
    type: 'varchar',
    enum: ['internal', 'verified', 'community', 'untrusted', 'quarantined']
  })
  trustLevel: 'internal' | 'verified' | 'community' | 'untrusted' | 'quarantined';

  @Column()
  assignedBy: string;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  evidence: string; // JSON string of TrustEvidence[]

  @Column({ nullable: true })
  validUntil: Date;

  @Column({ default: false })
  reviewRequired: boolean;

  @Column({ nullable: true })
  reviewedBy: string;

  @Column({ nullable: true })
  reviewedAt: Date;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}