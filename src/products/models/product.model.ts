export type Product = {
  productId: string;
  title: string;
  brand: string;
  category: string;
  subcategory?: string;
  price: number;
  currency: string;
  rating?: number;
  ratingCount?: number;
  inStock: boolean;
  imageUrl?: string;
  description?: string;
  seller?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};
