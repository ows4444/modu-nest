import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { PluginEntity } from './plugin.entity';

@Entity('plugin_downloads')
@Index(['pluginId'])
@Index(['downloadDate'])
export class PluginDownloadEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  pluginId!: number;

  @Column({ nullable: true })
  version!: string | null;

  @CreateDateColumn()
  downloadDate!: Date;

  @Column({ nullable: true })
  userAgent!: string | null;

  @Column({ nullable: true })
  ipAddress!: string | null;

  @ManyToOne(() => PluginEntity, (plugin) => plugin.downloads, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pluginId' })
  plugin!: PluginEntity;
}
