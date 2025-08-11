import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PluginDownloadEntity } from './plugin-download.entity';
import { PluginVersionEntity } from './plugin-version.entity';

@Entity('plugins')
@Index(['name'])
@Index(['checksum'])
@Index(['status'])
@Index(['uploadDate'])
// Composite indexes for common query patterns
@Index(['status', 'uploadDate']) // For listing active plugins by upload date
@Index(['name', 'status']) // For plugin lookups with status filter
@Index(['author', 'status']) // For author-based searches
@Index(['uploadDate', 'downloadCount']) // For sorting by popularity and recency
@Index(['tags']) // For tag-based searches (GIN index for PostgreSQL)
// Full-text search indexes (PostgreSQL specific)
@Index(['name', 'description', 'author']) // For multi-field searches
export class PluginEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  version!: string;

  @Column({ nullable: true })
  description!: string | null;

  @Column({ nullable: true })
  author!: string | null;

  @Column({ nullable: true })
  license!: string | null;

  @Column('text')
  manifest!: string; // JSON string

  @Column()
  filePath!: string;

  @Column('integer')
  fileSize!: number;

  @Column({ unique: true })
  checksum!: string;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  uploadDate!: Date;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  lastAccessed!: Date;

  @Column('integer', { default: 0 })
  downloadCount!: number;

  @Column({
    type: 'varchar',
    default: 'active',
    enum: ['active', 'deprecated', 'disabled'],
  })
  status!: 'active' | 'deprecated' | 'disabled';

  @Column('text', { default: '[]' })
  @Index() // Add GIN index for JSON operations in PostgreSQL
  tags!: string; // JSON array string

  @Column('text', { default: '[]' })
  dependencies!: string; // JSON array string

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => PluginDownloadEntity, (download) => download.plugin, { cascade: true })
  downloads!: PluginDownloadEntity[];

  @OneToMany(() => PluginVersionEntity, (version) => version.plugin, { cascade: false })
  versions!: PluginVersionEntity[];
}
