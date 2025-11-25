/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VideosService } from './videos.service';
import { Channel } from '../entities/channel.entity';
import { Video } from '../entities/video.entity';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

type ChannelRepoMock = {
  find: jest.Mock<Promise<Channel[]>, []>;
  findOne: jest.Mock<Promise<Channel | null>, [unknown?]>;
  save: jest.Mock<Promise<Channel>, [Channel]>;
  create: jest.Mock<Channel, [Partial<Channel>]>;
};

type VideoRepoMock = {
  find: jest.Mock<Promise<Video[]>, []>;
  findOne: jest.Mock<Promise<Video | null>, [unknown?]>;
  save: jest.Mock<Promise<Video>, [Video]>;
  create: jest.Mock<Video, [Partial<Video>]>;
};

const createChannelRepo = (): ChannelRepoMock => ({
  find: jest.fn<Promise<Channel[]>, []>(),
  findOne: jest.fn<Promise<Channel | null>, [unknown?]>(),
  save: jest.fn<Promise<Channel>, [Channel]>(),
  create: jest.fn<Channel, [Partial<Channel>]>((data) => data as Channel),
});

const createVideoRepo = (): VideoRepoMock => ({
  find: jest.fn<Promise<Video[]>, []>(),
  findOne: jest.fn<Promise<Video | null>, [unknown?]>(),
  save: jest.fn<Promise<Video>, [Video]>(),
  create: jest.fn<Video, [Partial<Video>]>((data) => data as Video),
});

describe('VideosService', () => {
  let service: VideosService;
  let channelRepo: ChannelRepoMock;
  let videoRepo: VideoRepoMock;

  beforeEach(async () => {
    channelRepo = createChannelRepo();
    videoRepo = createVideoRepo();

    const moduleRef = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Channel), useValue: channelRepo },
        { provide: getRepositoryToken(Video), useValue: videoRepo },
      ],
    })
      .overrideProvider(getRepositoryToken(Channel))
      .useValue(channelRepo as any)
      .overrideProvider(getRepositoryToken(Video))
      .useValue(videoRepo as any)
      .compile();

    service = moduleRef.get(VideosService);
  });

  it('should group videos and include channel metadata', async () => {
    const now = new Date();
    const channels: Channel[] = [
      {
        id: 1,
        channelId: 'c1',
        url: 'u1',
        themeSummary: 'alpha, beta',
        videos: [],
      },
      { id: 2, channelId: 'c2', url: 'u2', themeSummary: 'gamma', videos: [] },
    ];
    const videos: Video[] = [
      {
        id: 11,
        videoId: 'v1',
        title: 'alpha test',
        description: '',
        publishedAt: now,
        createdAt: now,
        topicLabel: 'group1',
        channelId: 1,
        channel: channels[0],
      },
      {
        id: 12,
        videoId: 'v2',
        title: 'beta test',
        description: '',
        publishedAt: now,
        createdAt: now,
        topicLabel: 'group1',
        channelId: 2,
        channel: channels[1],
      },
    ];

    videoRepo.find.mockResolvedValue(videos);
    channelRepo.find.mockResolvedValue(channels);

    const groups = await service.getGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('group1');
    expect(groups[0].videos).toHaveLength(2);
    expect(groups[0].channels?.map((c) => c?.id)).toEqual([1, 2]);
    expect(groups[0].channels?.[0]?.themeSummary).toBe('alpha, beta');
  });

  it('should compute channel themes from video keywords', async () => {
    const channel: Channel = {
      id: 1,
      channelId: 'c1',
      url: 'u1',
      themeSummary: null,
      videos: [],
    };
    const videos: Video[] = [
      {
        id: 11,
        videoId: 'v1',
        title: 'alpha beta beta',
        description: '',
        publishedAt: new Date(),
        createdAt: new Date(),
        topicLabel: 't1',
        channelId: 1,
        channel,
      },
      {
        id: 12,
        videoId: 'v2',
        title: 'beta gamma',
        description: '',
        publishedAt: new Date(),
        createdAt: new Date(),
        topicLabel: 't2',
        channelId: 1,
        channel,
      },
    ];

    videoRepo.find.mockResolvedValue(videos);
    channelRepo.findOne.mockImplementation(async ({ where: { id } }) =>
      id === 1 ? channel : null,
    );
    channelRepo.save.mockImplementation(async (c) => c);

    await (service as any).computeChannelThemes();
    expect(channel.themeSummary).toContain('beta');
  });

  it('should cap parsed videos by maxVideosPerChannel', () => {
    const xml = `
      <feed>
        <entry><yt:videoId>a</yt:videoId><title>One</title><media:description></media:description><published>2024-01-01T00:00:00Z</published></entry>
        <entry><yt:videoId>b</yt:videoId><title>Two</title><media:description></media:description><published>2024-01-02T00:00:00Z</published></entry>
        <entry><yt:videoId>c</yt:videoId><title>Three</title><media:description></media:description><published>2024-01-03T00:00:00Z</published></entry>
      </feed>
    `;
    (service as any).maxVideosPerChannel = 2;
    const parsed = (service as any).extractVideos(xml);
    expect(parsed).toHaveLength(2);
  });
});
