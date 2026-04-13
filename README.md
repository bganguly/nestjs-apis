# NestJS Products API + DynamoDB

An idiomatic NestJS REST API for ecommerce-style products, designed to start small and scale to millions of items in DynamoDB.

The data shape is user-relatable and React-friendly: title, brand, category, price, rating, image URL, description, stock, and tags.

## Why This Data Model

- Easy to consume in product grid/detail/filter UI.
- Supports scalable access patterns with DynamoDB GSIs.
- Works with both real imported data and synthetic generated data.

## Tech Stack

- NestJS 11
- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- TypeScript
- `class-validator` + `class-transformer`
- Optional synthetic data via `@faker-js/faker`

## DynamoDB Table Design

Single table: `Products` (name configurable)

- PK: `pk`
- SK: `sk`

Item keys:

- `pk = PRODUCT#<productId>`
- `sk = META`

Indexes:

- `GSI1` for category + price queries
	- `gsi1pk = CATEGORY#<slug(category)>`
	- `gsi1sk = PRICE#<zero-padded-cents>#<productId>`
- `GSI2` for brand listing (newest first)
	- `gsi2pk = BRAND#<slug(brand)>`
	- `gsi2sk = CREATED#<iso>#<productId>`
- `GSI3` for global newest products feed
	- `gsi3pk = ALL_PRODUCTS`
	- `gsi3sk = CREATED#<iso>#<productId>`

This avoids full table scans for common list views, which is important at million-item scale.

## Setup

1. Install deps

```bash
npm install
```

2. Create env file

```bash
cp .env.example .env
```

3. Configure `.env`

```env
PORT=3000
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=Products
# Optional for local DynamoDB
# AWS_ENDPOINT=http://localhost:8000
```

## Create Table

```bash
npm run create:table
```

## Add Data

### Option A: Synthetic Seed (recommended to start)

```bash
npm run seed:synthetic -- --count=10000 --batch=25
```

Run repeatedly to grow toward larger scales.

### Option B: Import Public CSV Dataset

```bash
npm run import:csv -- --file=./data/products.csv
```

Notes:

- Public datasets from Kaggle are usually easy to start with.
- Amazon-derived datasets can be much larger and realistic.
- Always verify per-dataset license and allowed use.

## Run API

Dev mode:

```bash
npm run start:dev
```

Build + prod mode:

```bash
npm run build
npm run start:prod
```

Base URL: `http://localhost:3000/api`

## Endpoints

- `POST /api/products`
- `GET /api/products/:id`
- `GET /api/products?category=electronics&minPrice=100&maxPrice=1200&limit=20&cursor=<token>`
- `GET /api/products?brand=apple&limit=20`
- `GET /api/products?limit=20`

Response for list includes `nextCursor` for pagination.

## Example Create Payload

```json
{
	"title": "Wireless Noise Cancelling Headphones",
	"brand": "SoundPeak",
	"category": "electronics",
	"subcategory": "audio",
	"price": 199.99,
	"rating": 4.6,
	"ratingCount": 1234,
	"imageUrl": "https://images.example.com/headphones.jpg",
	"description": "Premium ANC over-ear headphones with 30h battery.",
	"seller": "SoundPeak Official",
	"tags": ["wireless", "anc", "bestseller"]
}
```

## Scale Guidance

- Start with on-demand billing (`PAY_PER_REQUEST`).
- Keep hot partitions low with good key cardinality.
- Use cursor pagination, avoid large offsets.
- Add GSIs only for real query patterns.
- Ingest in batches and retry unprocessed writes.

## React App Compatibility

The model maps directly to typical UI needs:

- Product grid (title, image, price, rating)
- Category and brand filters
- Price sliders
- Product detail page
- Infinite scroll with `nextCursor`
