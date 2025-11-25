import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class IngestUrlsDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsUrl({}, { each: true })
  @IsString({ each: true })
  @MinLength(5, { each: true })
  @MaxLength(200, { each: true })
  urls: string[];
}
