import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Video } from './video.entity';

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  channelId: string;

  @Column()
  url: string;

  @Column({ type: 'text', nullable: true, default: null })
  themeSummary: string | null;

  @OneToMany(() => Video, (video) => video.channel)
  videos: Video[];
}
