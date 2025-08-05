import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  Index, 
  CreateDateColumn, 
  UpdateDateColumn, 
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { PluginEntity } from './plugin.entity';

@Entity('plugin_versions')
@Index(['pluginName'])
@Index(['pluginName', 'version'], { unique: true })
@Index(['pluginName', 'isActive'])
@Index(['checksum'])
@Index(['status'])
@Index(['uploadDate'])
export class PluginVersionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pluginName: string;

  @Column()
  version: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  author: string;

  @Column({ nullable: true })
  license: string;

  @Column('text')
  manifest: string; // JSON string

  @Column()
  filePath: string;

  @Column('integer')
  fileSize: number;

  @Column({ unique: true })
  checksum: string;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  uploadDate: Date;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  lastAccessed: Date;

  @Column('integer', { default: 0 })
  downloadCount: number;

  @Column({ 
    type: 'varchar',
    default: 'active',
    enum: ['active', 'deprecated', 'disabled', 'archived', 'rollback_target']
  })
  status: 'active' | 'deprecated' | 'disabled' | 'archived' | 'rollback_target';

  @Column('text', { default: '[]' })
  tags: string; // JSON array string

  @Column('text', { default: '[]' })
  dependencies: string; // JSON array string

  @Column({ default: false })
  isActive: boolean; // Only one version per plugin can be active

  @Column({ nullable: true })
  rollbackReason: string; // Reason for rollback if this version is a rollback target

  @Column({ nullable: true })
  promotionDate: Date; // When this version became active

  @Column({ nullable: true })
  deprecationDate: Date; // When this version was deprecated

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Optional relation to main plugin entity (for backward compatibility)
  @ManyToOne(() => PluginEntity, plugin => plugin.name, { 
    createForeignKeyConstraints: false,
    nullable: true 
  })
  @JoinColumn({ name: 'pluginName', referencedColumnName: 'name' })
  plugin?: PluginEntity;
}