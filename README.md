# NestJS Products API + DynamoDB

An idiomatic NestJS REST API for ecommerce-style products, designed to start small and scale to millions of items in DynamoDB.
The item data shape is user-relatable and React-friendly: title, brand, category, price, rating, image URL, description, stock, and tags.

## Table of Contents

- [Quick Run (Smallest Possible)](#quick-run-smallest-possible)
- [Tech Stack](#tech-stack)
- [Setup](#setup)
- [Quickstart (Infra Up/Down)](#quickstart-infra-updown)
- [Database (Table + Indexes)](#database-table--indexes)
	- [Table](#table)
	- [Create Table](#create-table)
	- [Add Data](#add-data)
- [API](#api)
- [Run API](#run-api)
- [Smoke Tests (curl)](#smoke-tests-curl)
- [Endpoints](#endpoints)
- [Cursor vs Page/Offset](#cursor-vs-pageoffset)
- [Example Create Payload](#example-create-payload)
- [Scale Guidance](#scale-guidance)
- [React App Compatibility](#react-app-compatibility)


## Quick Run (Smallest Possible)

```bash
# Start clean and install dependencies
rm -rf node_modules && npm install

# Start infra + API
npm run quickstart

# Quick check (in a new terminal)
curl -s "http://localhost:3000/api/products?limit=5" | jq

# Simplest teardown
npm run infra:down
```

If `quickstart` is running in the current terminal, run the quick check and teardown in a second terminal.

## Tech Stack

- NestJS 11
- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- TypeScript
- `class-validator` + `class-transformer`
- Optional synthetic data via `@faker-js/faker`

## Setup

```bash
# Install deps
npm install

# Create env file
cp .env.example .env
```

Configure `.env`:

```env
PORT=3000
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=Products
# Optional for local DynamoDB
# AWS_ENDPOINT=http://localhost:8000
```

If `DYNAMODB_TABLE_NAME` is omitted, the app and scripts default to `Products`.

## Quickstart (Infra Up/Down)

This project includes a simplified lifecycle flow:

- `infra:up`: creates the DynamoDB table and seeds initial data.
- `infra:down`: deletes the DynamoDB table.
- `quickstart`: runs `infra:up`, then starts the API in dev mode.

```bash
# One-command startup (infra + API)
npm run quickstart

# Bring infra up only (default 1000 items)
npm run infra:up

# Optional custom seed size
npm run infra:up -- --count=5000 --batch=25

# Start API in a second terminal
npm run start:dev

# Tear infra down when done
npm run infra:down
```

Notes:

- `quickstart` keeps the terminal attached while the API is running.
- For AWS cloud usage, ensure AWS credentials are configured in your environment.
- For local DynamoDB, set `AWS_ENDPOINT` in `.env`.

## Database (Table + Indexes)

### Table

Single table: `Products` (name configurable)

- PK: `pk`
- SK: `sk`

Item keys:

- `pk = PRODUCT#<productId>`
- `sk = META`

### Indexes

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

### Create Table

```bash
# Create the DynamoDB table
npm run create:table
```

### Add Data

```bash
# Option A: synthetic seed (recommended to start)
npm run seed:synthetic -- --count=10000 --batch=25

# Option B: import public CSV dataset
npm run import:csv -- --file=./data/products.csv
```

Run synthetic seed repeatedly to grow toward larger scales.

Notes:

- Public datasets from Kaggle are usually easy to start with.
- Amazon-derived datasets can be much larger and realistic.
- Always verify per-dataset license and allowed use.

## API

### Run API

```bash
# Dev mode
npm run start:dev

# Build + prod mode
npm run build
npm run start:prod
```

Base URL: `http://localhost:3000/api`

### Smoke Tests (curl)

After starting the API, run these from another terminal.

```bash
# 1) List products
curl -s "http://localhost:3000/api/products?limit=5" | jq

# 2) Create a product
curl -s -X POST "http://localhost:3000/api/products" \
	-H "Content-Type: application/json" \
	-d '{
		"title": "Bluetooth Speaker Mini",
		"brand": "SoundPeak",
		"category": "electronics",
		"subcategory": "audio",
		"price": 49.99,
		"rating": 4.4,
		"ratingCount": 321,
		"imageUrl": "https://images.example.com/speaker-mini.jpg",
		"description": "Portable speaker with USB-C fast charging.",
		"seller": "SoundPeak Store",
		"tags": ["portable", "wireless"]
	}' | jq

# 3) List by category and price
curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10" | jq

# 4) Fetch by product ID (replace <PRODUCT_ID>)
curl -s "http://localhost:3000/api/products/<PRODUCT_ID>" | jq

# 5) Replace product (PUT)
curl -s -X PUT "http://localhost:3000/api/products/<PRODUCT_ID>" \
	-H "Content-Type: application/json" \
	-d '{
		"title": "Bluetooth Speaker Mini v2",
		"brand": "SoundPeak",
		"category": "electronics",
		"subcategory": "audio",
		"price": 59.99,
		"rating": 4.5,
		"ratingCount": 410,
		"imageUrl": "https://images.example.com/speaker-mini-v2.jpg",
		"description": "Portable speaker with better battery life.",
		"seller": "SoundPeak Store",
		"tags": ["portable", "wireless", "bluetooth"]
	}' | jq

# 6) Partial update product (PATCH)
curl -s -X PATCH "http://localhost:3000/api/products/<PRODUCT_ID>" \
	-H "Content-Type: application/json" \
	-d '{
		"price": 54.99,
		"inStock": true,
		"tags": ["portable", "sale"]
	}' | jq

# 7) Delete product (DELETE)
curl -s -X DELETE "http://localhost:3000/api/products/<PRODUCT_ID>" | jq

# 8) Manual pagination page 1 + cursor
PAGE1=$(curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10")
CURSOR1=$(echo "$PAGE1" | jq -r '.nextCursor')
echo "CURSOR1=$CURSOR1"

# 8) Manual pagination page 2 + cursor
ENCODED_CURSOR1=$(printf '%s' "$CURSOR1" | jq -sRr @uri)
PAGE2=$(curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10&cursor=$ENCODED_CURSOR1")
CURSOR2=$(echo "$PAGE2" | jq -r '.nextCursor')
echo "CURSOR2=$CURSOR2"

# 8) Manual pagination page 3 + cursor
ENCODED_CURSOR2=$(printf '%s' "$CURSOR2" | jq -sRr @uri)
PAGE3=$(curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10&cursor=$ENCODED_CURSOR2")
CURSOR3=$(echo "$PAGE3" | jq -r '.nextCursor')
echo "CURSOR3=$CURSOR3"

# 8) Optional counts only (no full response body)
echo "PAGE1_COUNT=$(echo "$PAGE1" | jq -r '.count')"
echo "PAGE2_COUNT=$(echo "$PAGE2" | jq -r '.count')"
echo "PAGE3_COUNT=$(echo "$PAGE3" | jq -r '.count')"

# 9) Count total rows (all products)
npm run count:products

# 9) Count rows for same pagination filter scope
npm run count:products -- --category=electronics --minPrice=20 --maxPrice=200

# 10) Pagination utility (attempts up to 5 pages)
npm run demo:pagination

# 10) Force more pages for testing with smaller page size
npm run demo:pagination -- --limit=2 --pages=5
```

If your dataset returns fewer than 5 pages, pagination utility stops early (expected behavior).

Example output style:

- `Fetching page 1...`
- `Got cursor: <cursor-value>`
- `Fetching page 2...`
- `Got cursor: <cursor-value>`
- ... up to page 5, or earlier if `nextCursor` becomes empty.

### Endpoints

- `POST /api/products`
- `GET /api/products/:id`
- `PUT /api/products/:id`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/products?category=electronics&minPrice=100&maxPrice=1200&limit=20&cursor=<token>`
- `GET /api/products?brand=apple&limit=20`
- `GET /api/products?limit=20`

Response for list includes `nextCursor` for pagination.

### Cursor vs Page/Offset

Many UIs show page numbers, but this API intentionally uses cursor pagination for DynamoDB scale.

- Offset pagination is expensive in DynamoDB because there is no native `OFFSET`; deep pages require reading and discarding prior items.
- Cursor pagination uses the returned `nextCursor` as an opaque continuation token, keeping reads proportional to page size.
- Frontends typically do not inspect cursor contents; they store and resend it while still presenting page numbers in the UI.

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
