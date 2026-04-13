import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';

import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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

  @Get()
  async list(@Query() query: ListProductsDto) {
    return this.productsService.list(query);
  }
}
