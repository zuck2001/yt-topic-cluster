import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { Channel } from '../entities/channel.entity';
import { Video } from '../entities/video.entity';
import { IngestUrlsDto } from './dto/ingest-urls.dto';

type ParsedVideo = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
};

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);
  private readonly stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'to',
    'of',
    'for',
    'with',
    'in',
    'on',
    'at',
    'is',
    'are',
    'be',
    'this',
    'that',
    'it',
    'from',
    'by',
    'about',
    'video',
    'official',
    'new',
    'how',
    'why',
  ]);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
  ) {}

  async ingest(dto: IngestUrlsDto) {
    if (!dto.urls?.length) {
      throw new BadRequestException('Please send at least one channel URL.');
    }

    for (const url of dto.urls) {
      const channelId = await this.resolveChannelId(url);
      if (!channelId) {
        throw new BadRequestException(
          `Unable to resolve channel ID from ${url}`,
        );
      }

      let channel = await this.channelRepo.findOne({
        where: { channelId },
      });
      if (channel) {
        channel.url = url;
        channel = await this.channelRepo.save(channel);
      } else {
        channel = await this.channelRepo.save(
          this.channelRepo.create({ channelId, url }),
        );
      }

      const xml = await this.fetchChannelFeed(channelId);
      const parsedVideos = this.extractVideos(xml);

      for (const parsed of parsedVideos) {
        const existing = await this.videoRepo.findOne({
          where: { videoId: parsed.videoId },
        });
        if (existing) {
          existing.title = parsed.title;
          existing.description = parsed.description;
          existing.publishedAt = parsed.publishedAt;
          existing.channelId = channel.id;
          await this.videoRepo.save(existing);
        } else {
          const video = this.videoRepo.create({
            ...parsed,
            topicLabel: null,
            channelId: channel.id,
          });
          await this.videoRepo.save(video);
        }
      }
    }

    await this.assignTopics();
    await this.computeChannelThemes();
    return this.getGroups();
  }

  async getGroups() {
    const videos = await this.videoRepo.find();
    const channels = await this.channelRepo.find();
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const groups: Record<
      string,
      { label: string; videos: Video[]; channelIds: Set<number> }
    > = {};

    for (const video of videos) {
      const label = video.topicLabel || 'No Match';
      if (!groups[label]) {
        groups[label] = { label, videos: [], channelIds: new Set() };
      }
      groups[label].videos.push(video);
      groups[label].channelIds.add(video.channelId);
    }

    return Object.values(groups).map((group) => ({
      label: group.label,
      videos: group.videos,
      channels: Array.from(group.channelIds)
        .map((id) => channelMap.get(id))
        .filter(Boolean),
    }));
  }

  private async assignTopics() {
    const videos = await this.videoRepo.find();
    const buckets: {
      label: string;
      keywords: Set<string>;
      videos: Video[];
    }[] = [];

    for (const video of videos) {
      const keywords = this.extractKeywords(
        `${video.title} ${video.description ?? ''}`,
      );
      if (!keywords.size) {
        video.topicLabel = 'No Match';
        continue;
      }

      let matched = false;
      for (const bucket of buckets) {
        const overlap = this.countOverlap(bucket.keywords, keywords);
        // Require higher overlap to avoid over-grouping unrelated videos
        if (overlap >= 3) {
          bucket.videos.push(video);
          for (const word of keywords) bucket.keywords.add(word);
          matched = true;
          break;
        }
      }

      if (!matched) {
        const label = Array.from(keywords).slice(0, 3).join(' ') || 'No Match';
        buckets.push({ label, keywords: new Set(keywords), videos: [video] });
      }
    }

    // Persist labels; singletons become "No Match"
    for (const bucket of buckets) {
      const finalLabel = bucket.videos.length > 1 ? bucket.label : 'No Match';
      for (const video of bucket.videos) {
        video.topicLabel = finalLabel;
        await this.videoRepo.save(video);
      }
    }
  }

  private extractKeywords(text: string) {
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length > 2 && !this.stopWords.has(w));
    return new Set(words);
  }

  private countOverlap(a: Set<string>, b: Set<string>) {
    let count = 0;
    for (const word of a) {
      if (b.has(word)) count += 1;
    }
    return count;
  }

  private async resolveChannelId(url: string): Promise<string | null> {
    // If URL already contains /channel/<id>
    const directMatch = url.match(/channel\/([a-zA-Z0-9_-]+)/i);
    if (directMatch?.[1]) {
      return directMatch[1];
    }

    // Attempt to extract handle or custom name
    const handleMatch = url.match(/(?:@|user\/|c\/)([a-zA-Z0-9_-]+)/);
    const handle = handleMatch?.[1];

    // Try HTML scrape for channelId
    try {
      const html = await this.fetchHtml(url);
      const channelId =
        this.extractChannelIdFromHtml(html) ??
        this.extractChannelIdFromLink(html);
      if (channelId) return channelId;
    } catch (err) {
      this.logger.warn(`Failed to resolve channel id for ${url}: ${err}`);
    }

    // Fallback: try feeds by "user" name (works for legacy usernames)
    if (handle) {
      try {
        const feed = await this.fetchHtml(
          `https://www.youtube.com/feeds/videos.xml?user=${handle}`,
        );
        const channelId = this.extractChannelIdFromFeed(feed);
        if (channelId) return channelId;
      } catch (err) {
        this.logger.warn(`Fallback feed lookup failed for ${handle}: ${err}`);
      }
    }

    return null;
  }

  private async fetchChannelFeed(channelId: string): Promise<string> {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const response = await axios.get<string>(feedUrl, {
        responseType: 'text',
      });
      return response.data;
    } catch (err) {
      this.logger.error(`Failed to download feed ${feedUrl}: ${err}`);
      throw new BadRequestException('Unable to fetch YouTube feed.');
    }
  }

  private extractVideos(xml: string): ParsedVideo[] {
    const entries = xml.split('<entry>').slice(1);
    const videos: ParsedVideo[] = [];

    for (const entry of entries) {
      const videoId = this.extractTag(entry, 'yt:videoId');
      const title = this.extractTag(entry, 'title');
      const description = this.extractTag(entry, 'media:description') ?? '';
      const published = this.extractTag(entry, 'published');

      if (!videoId || !title || !published) continue;

      videos.push({
        videoId,
        title: this.decodeHtml(title),
        description: this.decodeHtml(description),
        publishedAt: new Date(published),
      });
    }

    return videos;
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = xml.match(regex);
    return match?.[1]?.trim() ?? null;
  }

  private extractChannelIdFromHtml(html: string): string | null {
    const match = html.match(/"channelId":"([a-zA-Z0-9_-]+)"/);
    return match?.[1] ?? null;
  }

  private extractChannelIdFromLink(html: string): string | null {
    const match = html.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/i);
    return match?.[1] ?? null;
  }

  private extractChannelIdFromFeed(xml: string): string | null {
    const match = xml.match(/<yt:channelId>([\s\S]*?)<\/yt:channelId>/i);
    return match?.[1]?.trim() ?? null;
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await axios.get<string>(url, {
      responseType: 'text',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return String(response.data);
  }

  private decodeHtml(str: string) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private async computeChannelThemes() {
    const videos = await this.videoRepo.find();
    const byChannel = new Map<number, Video[]>();
    for (const video of videos) {
      if (!byChannel.has(video.channelId)) {
        byChannel.set(video.channelId, []);
      }
      byChannel.get(video.channelId)?.push(video);
    }

    for (const [channelId, vids] of byChannel.entries()) {
      const freq = new Map<string, number>();
      for (const vid of vids) {
        const words = this.extractKeywords(
          `${vid.title} ${vid.description ?? ''}`,
        );
        for (const word of words) {
          freq.set(word, (freq.get(word) ?? 0) + 1);
        }
      }
      const sorted = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);
      const channel = await this.channelRepo.findOne({
        where: { id: channelId },
      });
      if (channel) {
        channel.themeSummary = sorted.length ? sorted.join(', ') : null;
        await this.channelRepo.save(channel);
      }
    }
  }
}
