import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  subcategory?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100000)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ratingCount?: number;

  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  seller?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
