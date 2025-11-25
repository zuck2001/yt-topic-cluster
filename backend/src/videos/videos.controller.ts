import { Body, Controller, Get, Post } from '@nestjs/common';
import { IngestUrlsDto } from './dto/ingest-urls.dto';
import { VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('ingest')
  async ingest(@Body() dto: IngestUrlsDto) {
    return this.videosService.ingest(dto);
  }

  @Get('groups')
  async getGroups() {
    return this.videosService.getGroups();
  }
}
