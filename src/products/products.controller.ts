import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ReplaceProductDto } from './dto/replace-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('categories')
  async listCategories() {
    return this.productsService.listCategories();
  }

  @Get('categories/count')
  async countDistinctCategories() {
    return this.productsService.countDistinctCategories();
  }

  @Post()
  async create(@Body() payload: CreateProductDto) {
    return this.productsService.create(payload);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const item = await this.productsService.findById(id);
    if (!item) {
      throw new NotFoundException('Product not found');
    }

    return item;
  }

  @Put(':id')
  async replace(@Param('id') id: string, @Body() payload: ReplaceProductDto) {
    const item = await this.productsService.replace(id, payload);
    if (!item) {
      throw new NotFoundException('Product not found');
    }

    return item;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() payload: UpdateProductDto) {
    const item = await this.productsService.update(id, payload);
    if (!item) {
      throw new NotFoundException('Product not found');
    }

    return item;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const deleted = await this.productsService.remove(id);
    if (!deleted) {
      throw new NotFoundException('Product not found');
    }

    return { deleted: true };
  }

  @Get()
  async list(@Query() query: ListProductsDto) {
    return this.productsService.list(query);
  }
}
